// middleware/roleCheck.js
/**
 * Middleware to check if user has the required role
 * @param {Array} roles - Array of allowed roles
 */
module.exports = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden - insufficient permissions' });
    }

    next();
  };
};
