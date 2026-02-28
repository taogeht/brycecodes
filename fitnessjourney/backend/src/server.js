require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const logRoutes = require('./routes/logs');
const mealRoutes = require('./routes/meals');
const workoutRoutes = require('./routes/workouts');
const supplementRoutes = require('./routes/supplements');
const metricRoutes = require('./routes/metrics');
const goalRoutes = require('./routes/goals');
const dashboardRoutes = require('./routes/dashboard');
const templateRoutes = require('./routes/templates');
const exportRoutes = require('./routes/export');
const importRoutes = require('./routes/import');
const sleepRoutes = require('./routes/sleep');

const app = express();
const PORT = process.env.PORT || 3001;
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// Ensure upload directories exist
['meals', 'photos'].forEach(dir => {
  const fullPath = path.join(UPLOAD_DIR, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.resolve(UPLOAD_DIR)));

// Routes
app.use('/auth', authRoutes);
app.use('/logs', logRoutes);
app.use('/meals', mealRoutes);
app.use('/workouts', workoutRoutes);
app.use('/supplements', supplementRoutes);
app.use('/metrics', metricRoutes);
app.use('/goals', goalRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/templates', templateRoutes);
app.use('/export', exportRoutes);
app.use('/import', importRoutes);
app.use('/sleep', sleepRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve frontend static files (production build)
const publicPath = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  // SPA fallback — serve index.html for any non-API route
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🏋️ Fitness Tracker API running on port ${PORT}`);
});
