const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function seed() {
    console.log('🌱 Seeding database...');

    const passwordHash = await bcrypt.hash('changeme123', 10);
    const bryceApiKey = crypto.randomBytes(32).toString('hex');

    const user = await prisma.user.upsert({
        where: { email: 'brycev@gmail.com' },
        update: { apiKey: bryceApiKey },
        create: {
            email: 'brycev@gmail.com',
            passwordHash,
            name: 'Bryce',
            apiKey: bryceApiKey
        }
    });

    console.log(`✅ User created: ${user.email} (password: changeme123)`);
    console.log(`   API Key: ${bryceApiKey}`);

    // Add Bill
    const billHash = await bcrypt.hash('canucks', 10);
    const billApiKey = crypto.randomBytes(32).toString('hex');

    const bill = await prisma.user.upsert({
        where: { email: 'bill@bigguns.com' },
        update: { apiKey: billApiKey },
        create: {
            email: 'bill@bigguns.com',
            passwordHash: billHash,
            name: 'Bill',
            apiKey: billApiKey
        }
    });

    console.log(`✅ User created: ${bill.email}`);
    console.log(`   API Key: ${billApiKey}`);

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
