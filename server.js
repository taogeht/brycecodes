const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 80;
const DATA_FILE = process.env.DATA_PATH || path.join(__dirname, 'data.json');
const TIMESHEET_DATA_FILE = process.env.TIMESHEET_DATA_PATH || path.join(__dirname, 'timesheet_data.json');
const CHORES_DATA_FILE = process.env.CHORES_DATA_PATH || path.join(__dirname, 'chores_data.json');

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

// Ensure the directory for CHORES_DATA_FILE exists
const choresDataDir = path.dirname(CHORES_DATA_FILE);
if (!fs.existsSync(choresDataDir)) {
    fs.mkdirSync(choresDataDir, { recursive: true });
}

app.use(cors());

// Fitness Journey: proxy API requests to the fitness backend (port 3001)
// IMPORTANT: Proxy must be registered BEFORE bodyParser.json() so the request
// body stream is not consumed before being forwarded to the backend.
const { createProxyMiddleware } = require('http-proxy-middleware');

app.use('/fitnessjourney/api', (req, res, next) => {
    console.log(`[PROXY] ${req.method} ${req.originalUrl} -> http://localhost:3001${req.originalUrl.replace('/fitnessjourney/api', '')}`);
    next();
}, createProxyMiddleware({
    target: 'http://localhost:3001',
    changeOrigin: true,
    pathRewrite: { '^/fitnessjourney/api': '' },
    on: {
        proxyReq: (proxyReq, req) => {
            console.log(`[PROXY] Forwarding: ${req.method} ${proxyReq.path}`);
        },
        proxyRes: (proxyRes, req) => {
            console.log(`[PROXY] Response: ${proxyRes.statusCode} for ${req.method} ${req.originalUrl}`);
        },
        error: (err, req, res) => {
            console.error(`[PROXY] Error: ${err.message}`);
            res.status(502).json({ error: 'Proxy error', details: err.message });
        }
    }
}));
app.use('/fitnessjourney/uploads', createProxyMiddleware({
    target: 'http://localhost:3001',
    changeOrigin: true,
    pathRewrite: { '^/fitnessjourney/uploads': '/uploads' },
}));

// Body parser AFTER proxy routes so it doesn't consume the request stream
app.use(bodyParser.json());

// Serve static files
app.use('/invoice', express.static(path.join(__dirname, 'invoice')));
app.use('/mainpage', express.static(path.join(__dirname, 'mainpage')));
app.use('/EnglishAngel', express.static(path.join(__dirname, 'englishangel')));
app.use('/timesheet', express.static(path.join(__dirname, 'timesheet')));
app.use('/chores', express.static(path.join(__dirname, 'chores', 'public')));

// Fitness Journey: serve frontend static files
app.use('/fitnessjourney', express.static(path.join(__dirname, 'fitnessjourney', 'frontend', 'dist')));
// SPA fallback for fitness journey client-side routing
app.get('/fitnessjourney/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'fitnessjourney', 'frontend', 'dist', 'index.html'));
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

// API for Chores persistence — atomic write via tmp+rename, serialized through a queue
let choresWriting = false;
const choresWriteQueue = [];

function flushChoresQueue() {
    if (choresWriting || choresWriteQueue.length === 0) return;
    choresWriting = true;
    const { data, res } = choresWriteQueue.shift();
    const tmp = CHORES_DATA_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(data, null, 2), (err) => {
        if (err) {
            choresWriting = false;
            res.status(500).json({ error: 'Write failed' });
            flushChoresQueue();
            return;
        }
        fs.rename(tmp, CHORES_DATA_FILE, (err2) => {
            choresWriting = false;
            if (err2) {
                res.status(500).json({ error: 'Rename failed' });
            } else {
                res.json({ success: true });
            }
            flushChoresQueue();
        });
    });
}

app.get('/api/chores', (req, res) => {
    if (!fs.existsSync(CHORES_DATA_FILE)) {
        return res.json(null); // frontend uses defaultState() when null
    }
    try {
        const raw = fs.readFileSync(CHORES_DATA_FILE, 'utf8');
        res.json(JSON.parse(raw));
    } catch (err) {
        console.error("Error reading chores data file:", err);
        res.status(500).json({ error: "Read failed" });
    }
});

app.post('/api/chores', (req, res) => {
    const data = req.body;
    if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Invalid payload' });
    }
    choresWriteQueue.push({ data, res });
    flushChoresQueue();
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
