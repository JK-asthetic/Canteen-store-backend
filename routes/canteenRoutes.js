const express = require('express');
const router = express.Router();
const canteenController = require('../controllers/canteenController');
const authMiddleware = require('../middleware/auth');

// Canteen routes
router.post('/canteens', authMiddleware, canteenController.createCanteen);
router.get('/canteens', authMiddleware, canteenController.getCanteens);
router.get('/canteens/:id', authMiddleware, canteenController.getCanteenById);
router.put('/canteens/:id', authMiddleware, canteenController.updateCanteen);
router.delete('/canteens/:id', authMiddleware, canteenController.deleteCanteen);

// Lock system routes (admin only)
router.post('/canteens/:id/lock', authMiddleware, canteenController.lockCanteen);
router.post('/canteens/:id/unlock', authMiddleware, canteenController.unlockCanteen);
router.get('/canteens-locked', authMiddleware, canteenController.getLockedCanteens);

// Auto-unlock endpoint (can be called by cron job or manually)
router.post('/canteens/auto-unlock', authMiddleware, canteenController.autoUnlockCanteens);

module.exports = router;