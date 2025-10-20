const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Auth routes
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', authController.getCurrentUser);

module.exports = router;