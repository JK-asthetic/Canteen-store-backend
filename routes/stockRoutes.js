const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const authMiddleware = require('../middleware/auth');

// Stock routes
router.post('/stocks', authMiddleware, stockController.updateStock);
router.get('/stocks/canteen/:canteen_id', authMiddleware, stockController.getStockByCanteen);
router.get('/stocks/history/:canteen_id', authMiddleware, stockController.getStockHistory);
router.get('/stocks/history/:canteen_id/:item_id', authMiddleware, stockController.getStockHistory);

module.exports = router;