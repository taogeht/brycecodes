// One-shot script: copy invoice data out of Supabase and into the shared
// Postgres (invoice.students + invoice.bookings). Preserves source ids and is
// idempotent (ON CONFLICT DO NOTHING), so it's safe to re-run.
//
// Prereqs:
//   npm install --no-save @supabase/supabase-js
//
// Run:
//   SUPABASE_URL=... SUPABASE_KEY=... DATABASE_URL=... \
//     node scripts/migrate-invoice-from-supabase.js
//
// Verify after:
//   psql "$DATABASE_URL" -c "SELECT count(*) FROM invoice.students;
//                            SELECT count(*) FROM invoice.bookings;"

const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_KEY, DATABASE_URL } = process.env;
if (!SUPABASE_URL || !SUPABASE_KEY || !DATABASE_URL) {
    console.error('Missing env: need SUPABASE_URL, SUPABASE_KEY, DATABASE_URL');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const pool = new Pool({ connectionString: DATABASE_URL });

async function fetchAll(table) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw new Error(`Supabase read ${table}: ${error.message}`);
    return data;
}

async function main() {
    const [students, bookings] = await Promise.all([
        fetchAll('students'),
        fetchAll('bookings'),
    ]);
    console.log(`Source: ${students.length} students, ${bookings.length} bookings`);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let studentsInserted = 0;
        for (const s of students) {
            const { rowCount } = await client.query(
                `INSERT INTO invoice.students (id, name, active)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (id) DO NOTHING`,
                [s.id, s.name, s.active ?? true]
            );
            studentsInserted += rowCount;
        }

        let bookingsInserted = 0;
        for (const b of bookings) {
            const { rowCount } = await client.query(
                `INSERT INTO invoice.bookings
                   (id, student_name, booking_date, start_time, end_time, duration_hours, amount)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (id) DO NOTHING`,
                [b.id, b.student_name, b.booking_date, b.start_time, b.end_time, b.duration_hours, b.amount]
            );
            bookingsInserted += rowCount;
        }

        await client.query('COMMIT');
        console.log(`Inserted: ${studentsInserted} students, ${bookingsInserted} bookings (skipped ${students.length - studentsInserted} + ${bookings.length - bookingsInserted} as already present)`);
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
