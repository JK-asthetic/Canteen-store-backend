const express = require('express');
const router = express.Router();
const unitController = require('../controllers/unitController');
const authMiddleware = require('../middleware/auth');

// Unit routes
router.post('/units', authMiddleware, unitController.createUnit);
router.get('/units', authMiddleware, unitController.getUnits);
router.get('/units/:id', authMiddleware, unitController.getUnitById);
router.put('/units/:id', authMiddleware, unitController.updateUnit);
router.delete('/units/:id', authMiddleware, unitController.deleteUnit);

module.exports = router;
