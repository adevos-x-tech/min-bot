const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Requires a valid user session token (Authorization: Bearer <token>).
 * Attaches the authenticated user document to req.user.
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Authentication token missing' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.userId);

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Session is no longer valid' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session' });
  }
}

/**
 * Requires a valid admin session token, issued only by the /api/admin/login
 * route after verifying ADMIN_USERNAME / ADMIN_PASSWORD.
 */
function requireAdmin(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Admin authentication required' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.scope !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin privileges required' });
    }

    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired admin session' });
  }
}

module.exports = { requireAuth, requireAdmin };
