const jwt = require('jsonwebtoken');
const User = require('../models/User');

module.exports = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token, authorization denied' });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Find user by id
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Add user to request object
      req.user = user;
      next();
    } catch (err) {
      // Check if token is expired
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          error: 'Token expired', 
          code: 'TOKEN_EXPIRED' 
        });
      }
      
      // Handle other JWT errors
      return res.status(401).json({ error: 'Token is not valid' });
    }
  } catch (err) {
    console.error('Auth middleware error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};