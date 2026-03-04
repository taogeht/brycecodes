const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function seed() {
    console.log('🌱 Seeding database...');

    const passwordHash = await bcrypt.hash('changeme123', 10);

    const user = await prisma.user.upsert({
        where: { email: 'brycev@gmail.com' },
        update: { isAdmin: true },
        create: {
            email: 'brycev@gmail.com',
            passwordHash,
            name: 'Bryce',
            isAdmin: true,
            apiKey: crypto.randomBytes(32).toString('hex')
        }
    });

    // Ensure user has an API key (for existing users who don't have one yet)
    if (!user.apiKey) {
        const newKey = crypto.randomBytes(32).toString('hex');
        await prisma.user.update({ where: { id: user.id }, data: { apiKey: newKey } });
        console.log(`✅ User: ${user.email} — generated new API key`);
    } else {
        console.log(`✅ User: ${user.email} — API key already set`);
    }

    // Add Bill
    const billHash = await bcrypt.hash('canucks', 10);

    const bill = await prisma.user.upsert({
        where: { email: 'bill@bigguns.com' },
        update: {},
        create: {
            email: 'bill@bigguns.com',
            passwordHash: billHash,
            name: 'Bill',
            apiKey: crypto.randomBytes(32).toString('hex')
        }
    });

    if (!bill.apiKey) {
        const newKey = crypto.randomBytes(32).toString('hex');
        await prisma.user.update({ where: { id: bill.id }, data: { apiKey: newKey } });
        console.log(`✅ User: ${bill.email} — generated new API key`);
    } else {
        console.log(`✅ User: ${bill.email} — API key already set`);
    }

    // Create some default goals
    const today = new Date();
    const threeMonthsLater = new Date(today);
    threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

    await prisma.goal.upsert({
        where: { id: 'default-weight-goal' },
        update: {},
        create: {
            id: 'default-weight-goal',
            userId: user.id,
            goalType: 'weight',
            targetValue: 75,
            startDate: today,
            targetDate: threeMonthsLater
        }
    });

    await prisma.goal.upsert({
        where: { id: 'default-calorie-goal' },
        update: {},
        create: {
            id: 'default-calorie-goal',
            userId: user.id,
            goalType: 'calories',
            targetValue: 2000,
            startDate: today,
            targetDate: threeMonthsLater
        }
    });

    await prisma.goal.upsert({
        where: { id: 'default-protein-goal' },
        update: {},
        create: {
            id: 'default-protein-goal',
            userId: user.id,
            goalType: 'protein',
            targetValue: 150,
            startDate: today,
            targetDate: threeMonthsLater
        }
    });

    console.log('✅ Default goals created');
    console.log('🎉 Seed complete!');

    await prisma.$disconnect();
}

seed().catch((err) => {
    console.error('Seed error:', err);
    process.exit(1);
});
