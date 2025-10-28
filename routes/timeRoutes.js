const express = require('express');
const router = express.Router();
const timeController = require('../controllers/timeController');
const authMiddleware = require('../middleware/auth');

// Time routes
router.get('/time/current', authMiddleware, timeController.getCurrentTime);

module.exports = router;