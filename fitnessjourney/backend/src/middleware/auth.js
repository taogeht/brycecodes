const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const JWT_SECRET = process.env.JWT_SECRET || 'yoursecret';
const prisma = new PrismaClient();

async function authenticate(req, res, next) {
    // 1. Check for API key first
    const apiKey = req.headers['x-api-key'];
    if (apiKey) {
        try {
            const user = await prisma.user.findUnique({ where: { apiKey } });
            if (!user) {
                return res.status(401).json({ error: 'Invalid API key' });
            }
            req.userId = user.id;
            return next();
        } catch (err) {
            return res.status(500).json({ error: 'API key lookup failed' });
        }
    }

    // 2. Fall back to JWT Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token or API key provided' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        return res.status(401).json({ error: 'Invalid token' });
    }
}

function generateTokens(userId) {
    const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '24h' });
    const refreshToken = jwt.sign({ userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
}

module.exports = { authenticate, generateTokens };
