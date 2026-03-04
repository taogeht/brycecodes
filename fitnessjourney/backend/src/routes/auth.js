const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { authenticate, generateTokens } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'yoursecret';

// POST /auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const tokens = generateTokens(user.id);
        res.json({
            user: { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin },
            ...tokens
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Login failed', details: err.message });
    }
});

// POST /auth/refresh
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token required' });
        }

        const decoded = jwt.verify(refreshToken, JWT_SECRET);
        if (decoded.type !== 'refresh') {
            return res.status(401).json({ error: 'Invalid token type' });
        }

        const tokens = generateTokens(decoded.userId);
        res.json(tokens);
    } catch (err) {
        res.status(401).json({ error: 'Invalid refresh token' });
    }
});

// GET /auth/users — list all users (admin only)
router.get('/users', authenticate, async (req, res) => {
    try {
        const admin = await prisma.user.findUnique({ where: { id: req.userId } });
        if (!admin?.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const users = await prisma.user.findMany({
            select: { id: true, email: true, name: true, createdAt: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(users);
    } catch (err) {
        console.error('List users error:', err);
        res.status(500).json({ error: 'Failed to list users' });
    }
});

// POST /auth/users — create a new user (admin only)
router.post('/users', authenticate, async (req, res) => {
    try {
        const admin = await prisma.user.findUnique({ where: { id: req.userId } });
        if (!admin?.isAdmin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
            return res.status(409).json({ error: 'A user with that email already exists' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const name = email.split('@')[0];
        const user = await prisma.user.create({
            data: {
                email,
                passwordHash,
                name,
                apiKey: crypto.randomBytes(32).toString('hex')
            }
        });

        res.status(201).json({ id: user.id, email: user.email, name: user.name });
    } catch (err) {
        console.error('Create user error:', err);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

module.exports = router;
