const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 80;
const DATA_FILE = process.env.DATA_PATH || path.join(__dirname, 'data.json');
const TIMESHEET_DATA_FILE = process.env.TIMESHEET_DATA_PATH || path.join(__dirname, 'timesheet_data.json');

// Ensure the directory for DATA_FILE exists
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure the directory for TIMESHEET_DATA_FILE exists
const timesheetDataDir = path.dirname(TIMESHEET_DATA_FILE);
if (!fs.existsSync(timesheetDataDir)) {
    fs.mkdirSync(timesheetDataDir, { recursive: true });
}

// Postgres pool for chores + invoice persistence (uses DATABASE_URL).
// Bootstraps its own schemas/tables on first start — no separate migration step.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(`
    CREATE SCHEMA IF NOT EXISTS chores;
    CREATE TABLE IF NOT EXISTS chores.state (
        id TEXT PRIMARY KEY DEFAULT 'singleton',
        data JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    CREATE SCHEMA IF NOT EXISTS invoice;
    CREATE TABLE IF NOT EXISTS invoice.students (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS invoice.bookings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_name TEXT NOT NULL,
        booking_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        duration_hours NUMERIC NOT NULL,
        amount NUMERIC NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS invoice_bookings_date_idx ON invoice.bookings (booking_date);
    CREATE INDEX IF NOT EXISTS invoice_bookings_student_name_idx ON invoice.bookings (student_name);
`).catch(err => console.error('Schema bootstrap failed:', err.message));

app.use(cors());

// 12x12: proxy API requests to the flashcards backend (port 3002).
// IMPORTANT: Proxy must be registered BEFORE bodyParser.json() so the
// request body stream isn't consumed before being forwarded.
const { createProxyMiddleware } = require('http-proxy-middleware');

app.use('/12x12/api', createProxyMiddleware({
    target: 'http://localhost:3002',
    changeOrigin: true,
    // app.use('/12x12/api', ...) already strips the mount path, so by the
    // time string-based pathRewrite runs, req.url is just /users (not
    // /12x12/api/users). Use a function and originalUrl so we can drop
    // /12x12 and keep /api — the 12x12 backend's routes are /api/*.
    pathRewrite: (_path, req) => req.originalUrl.replace(/^\/12x12/, ''),
    on: {
        // Without this handler, http-proxy-middleware v3 falls through to
        // the next middleware on connection errors — which means the SPA
        // fallback below would return index.html for failed API calls.
        error: (err, req, res) => {
            console.error(`[12x12 proxy] ${err.message}`);
            if (res && !res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '12x12 backend unreachable', details: err.message }));
            }
        }
    }
}));

// Body parser AFTER proxy routes so it doesn't consume the request stream
app.use(bodyParser.json());

// Serve static files
app.use('/invoice', express.static(path.join(__dirname, 'invoice')));
app.use('/mainpage', express.static(path.join(__dirname, 'mainpage')));
app.use('/EnglishAngel', express.static(path.join(__dirname, 'englishangel')));
app.use('/timesheet', express.static(path.join(__dirname, 'timesheet')));
app.use('/chores', express.static(path.join(__dirname, 'chores', 'public')));

// 12x12: serve CRA build output
app.use('/12x12', express.static(path.join(__dirname, '12x12', 'client', 'build')));
// SPA fallback for 12x12 (CRA in-app routing)
app.get('/12x12/*', (req, res) => {
    res.sendFile(path.join(__dirname, '12x12', 'client', 'build', 'index.html'));
});

// Root redirect to /mainpage
app.get('/', (req, res) => {
    res.redirect('/mainpage/');
});

// API for English Angel persistence
app.get('/api/angels', (req, res) => {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            res.json(JSON.parse(data));
        } catch (err) {
            console.error("Error reading data file:", err);
            res.json([]);
        }
    } else {
        res.json([]);
    }
});

app.post('/api/angels', (req, res) => {
    const newData = req.body;
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(newData, null, 2));
        res.json({ success: true });
    } catch (err) {
        console.error("Error writing data file:", err);
        res.status(500).json({ error: "Failed to save data" });
    }
});

// API for Timesheet persistence
app.get('/api/timesheet', (req, res) => {
    if (fs.existsSync(TIMESHEET_DATA_FILE)) {
        try {
            const data = fs.readFileSync(TIMESHEET_DATA_FILE, 'utf8');
            res.json(JSON.parse(data));
        } catch (err) {
            console.error("Error reading timesheet data file:", err);
            res.json({});
        }
    } else {
        res.json({});
    }
});

app.post('/api/timesheet', (req, res) => {
    const newData = req.body;
    try {
        fs.writeFileSync(TIMESHEET_DATA_FILE, JSON.stringify(newData, null, 2));
        res.json({ success: true });
    } catch (err) {
        console.error("Error writing timesheet data file:", err);
        res.status(500).json({ error: "Failed to save timesheet data" });
    }
});

// API for Chores persistence — single JSONB row in chores.state
app.get('/api/chores', async (req, res) => {
    try {
        const { rows } = await pool.query(
            "SELECT data FROM chores.state WHERE id = 'singleton'"
        );
        // null tells the frontend to use defaultState()
        res.json(rows.length ? rows[0].data : null);
    } catch (err) {
        console.error("Error reading chores state:", err.message);
        res.status(500).json({ error: 'Read failed' });
    }
});

app.post('/api/chores', async (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Invalid payload' });
    }
    try {
        await pool.query(
            `INSERT INTO chores.state (id, data, updated_at)
             VALUES ('singleton', $1, NOW())
             ON CONFLICT (id) DO UPDATE
                SET data = EXCLUDED.data, updated_at = NOW()`,
            [data]
        );
        res.json({ success: true });
    } catch (err) {
        console.error("Error writing chores state:", err.message);
        res.status(500).json({ error: 'Write failed' });
    }
});

// API for Invoice persistence — bookings + students in the invoice schema.
// Open endpoints (no auth), matching the frontend's original Supabase anon-key
// posture; the UI gates entry with a localStorage access code.
const INVOICE_BOOKING_FIELDS = [
    'student_name', 'booking_date', 'start_time',
    'end_time', 'duration_hours', 'amount'
];

app.get('/api/invoice/bookings', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM invoice.bookings');
        res.json(rows);
    } catch (err) {
        console.error('Error reading invoice bookings:', err.message);
        res.status(500).json({ error: 'Read failed' });
    }
});

app.post('/api/invoice/bookings', async (req, res) => {
    const body = req.body;
    const items = Array.isArray(body)
        ? body
        : (Array.isArray(body && body.bookings) ? body.bookings : [body]);
    if (!items.length || items.some(b => !b || typeof b !== 'object')) {
        return res.status(400).json({ error: 'Invalid payload' });
    }
    const valuesSql = [];
    const params = [];
    items.forEach((item, i) => {
        const offset = i * INVOICE_BOOKING_FIELDS.length;
        const placeholders = INVOICE_BOOKING_FIELDS.map((_, j) => `$${offset + j + 1}`);
        valuesSql.push(`(${placeholders.join(', ')})`);
        INVOICE_BOOKING_FIELDS.forEach(f => params.push(item[f]));
    });
    try {
        const { rows } = await pool.query(
            `INSERT INTO invoice.bookings (${INVOICE_BOOKING_FIELDS.join(', ')})
             VALUES ${valuesSql.join(', ')}
             RETURNING *`,
            params
        );
        res.json(rows);
    } catch (err) {
        console.error('Error inserting invoice bookings:', err.message);
        res.status(500).json({ error: 'Insert failed' });
    }
});

app.patch('/api/invoice/bookings/:id', async (req, res) => {
    const updates = req.body || {};
    const fields = INVOICE_BOOKING_FIELDS.filter(f => f in updates);
    if (fields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }
    const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
    const params = fields.map(f => updates[f]);
    params.push(req.params.id);
    try {
        const { rows } = await pool.query(
            `UPDATE invoice.bookings SET ${setClause}
             WHERE id = $${params.length}
             RETURNING *`,
            params
        );
        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
    } catch (err) {
        console.error('Error updating invoice booking:', err.message);
        res.status(500).json({ error: 'Update failed' });
    }
});

app.delete('/api/invoice/bookings/:id', async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            'DELETE FROM invoice.bookings WHERE id = $1',
            [req.params.id]
        );
        if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting invoice booking:', err.message);
        res.status(500).json({ error: 'Delete failed' });
    }
});

app.post('/api/invoice/bookings/bulk', async (req, res) => {
    const { delete: deleteIds, update: updateRows } = req.body || {};
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const updated = [];
        if (Array.isArray(updateRows)) {
            for (const row of updateRows) {
                if (!row || !row.id) continue;
                const fields = INVOICE_BOOKING_FIELDS.filter(f => f in row);
                if (fields.length === 0) continue;
                const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(', ');
                const params = fields.map(f => row[f]);
                params.push(row.id);
                const { rows } = await client.query(
                    `UPDATE invoice.bookings SET ${setClause}
                     WHERE id = $${params.length}
                     RETURNING *`,
                    params
                );
                if (rows.length) updated.push(rows[0]);
            }
        }
        let deleted = 0;
        if (Array.isArray(deleteIds) && deleteIds.length > 0) {
            const { rowCount } = await client.query(
                'DELETE FROM invoice.bookings WHERE id = ANY($1::uuid[])',
                [deleteIds]
            );
            deleted = rowCount;
        }
        await client.query('COMMIT');
        res.json({ updated, deleted });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error in invoice bookings bulk op:', err.message);
        res.status(500).json({ error: 'Bulk op failed' });
    } finally {
        client.release();
    }
});

app.get('/api/invoice/students', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT * FROM invoice.students ORDER BY name ASC'
        );
        res.json(rows);
    } catch (err) {
        console.error('Error reading invoice students:', err.message);
        res.status(500).json({ error: 'Read failed' });
    }
});

app.post('/api/invoice/students', async (req, res) => {
    const name = (req.body && typeof req.body.name === 'string') ? req.body.name.trim() : '';
    if (!name) return res.status(400).json({ error: 'Name is required' });
    try {
        const { rows } = await pool.query(
            `INSERT INTO invoice.students (name, active)
             VALUES ($1, TRUE)
             RETURNING *`,
            [name]
        );
        res.json(rows[0]);
    } catch (err) {
        console.error('Error inserting invoice student:', err.message);
        res.status(500).json({ error: 'Insert failed' });
    }
});

app.patch('/api/invoice/students/:id', async (req, res) => {
    const { name, active } = req.body || {};
    if (name === undefined && active === undefined) {
        return res.status(400).json({ error: 'No fields to update' });
    }
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Read current name first so a rename can cascade to bookings in the same txn.
        const existing = await client.query(
            'SELECT name FROM invoice.students WHERE id = $1',
            [req.params.id]
        );
        if (existing.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Not found' });
        }
        const oldName = existing.rows[0].name;
        const setParts = [];
        const params = [];
        let newName;
        if (name !== undefined) {
            newName = String(name).trim();
            params.push(newName);
            setParts.push(`name = $${params.length}`);
        }
        if (active !== undefined) {
            params.push(!!active);
            setParts.push(`active = $${params.length}`);
        }
        params.push(req.params.id);
        const { rows } = await client.query(
            `UPDATE invoice.students SET ${setParts.join(', ')}
             WHERE id = $${params.length}
             RETURNING *`,
            params
        );
        if (newName !== undefined && newName !== oldName) {
            await client.query(
                'UPDATE invoice.bookings SET student_name = $1 WHERE student_name = $2',
                [newName, oldName]
            );
        }
        await client.query('COMMIT');
        res.json(rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error updating invoice student:', err.message);
        res.status(500).json({ error: 'Update failed' });
    } finally {
        client.release();
    }
});

app.delete('/api/invoice/students/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const existing = await client.query(
            'SELECT name FROM invoice.students WHERE id = $1',
            [req.params.id]
        );
        if (existing.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Not found' });
        }
        await client.query(
            'DELETE FROM invoice.bookings WHERE student_name = $1',
            [existing.rows[0].name]
        );
        await client.query(
            'DELETE FROM invoice.students WHERE id = $1',
            [req.params.id]
        );
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error deleting invoice student:', err.message);
        res.status(500).json({ error: 'Delete failed' });
    } finally {
        client.release();
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
