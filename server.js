require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { connectDatabase } = require('./config/database');
const logger = require('./utils/logger');

const authRoutes = require('./routes/auth');
const pairRoutes = require('./routes/pair');
const statusRoutes = require('./routes/status');
const sessionRoutes = require('./routes/sessions');
const groupRoutes = require('./routes/groups');
const settingsRoutes = require('./routes/settings');
const commandRoutes = require('./routes/commands');
const adminRoutes = require('./routes/admin');

const socketManager = require('./whatsapp/socketManager');
const { startTelegramBot } = require('./telegram/bot');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MINUTES || 15) * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 100),
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// Static frontend (public website, dashboard, admin panel, PWA assets)
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/pair', pairRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/test-command', commandRoutes);
app.use('/api/admin', adminRoutes);

// Admin panel entry point: botlinkwebsite/admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Single-page app fallback for all other routes (home, login, dashboard, etc.)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  logger.error('server', err.stack || err.message);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

async function bootstrap() {
  const dbConnected = await connectDatabase();

  app.listen(PORT, () => {
    logger.success('server', `Adevos Min-Bot platform listening on port ${PORT}`);
  });

  if (dbConnected) {
    await socketManager.resumeAllSessions();
  } else {
    logger.warn('server', 'Skipping WhatsApp session resume: no database connection');
  }

  startTelegramBot();
}

bootstrap().catch((err) => {
  logger.error('server', `Fatal startup error: ${err.message}`);
  process.exit(1);
});

process.on('SIGINT', () => {
  logger.info('server', 'Shutting down gracefully...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  logger.info('server', 'Shutting down gracefully...');
  process.exit(0);
});
