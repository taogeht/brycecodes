// Ensure the api_key column exists in the users table.
// This runs raw SQL as a fallback in case prisma db push fails.
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function migrate() {
    try {
        // Check if column exists first
        const result = await prisma.$queryRaw`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'users' AND column_name = 'api_key'
        `;

        if (result.length === 0) {
            console.log('Adding api_key column to users table...');
            await prisma.$executeRaw`
                ALTER TABLE users ADD COLUMN api_key VARCHAR(255) UNIQUE
            `;
            console.log('✅ api_key column added successfully');
        } else {
            console.log('✅ api_key column already exists');
        }
    } catch (err) {
        console.error('Migration error:', err.message);
    } finally {
        await prisma.$disconnect();
    }
}

migrate();
