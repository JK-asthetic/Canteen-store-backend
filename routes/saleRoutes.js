const express = require('express');
const router = express.Router();
const saleController = require('../controllers/saleController');
const authMiddleware = require('../middleware/auth');


router.get('/sales/canteen/:canteenId', authMiddleware, saleController.getSalesByCanteen);
router.get('/sales/date-range', authMiddleware, saleController.getSalesByDateRange);

// Sale routes
router.post('/sales', authMiddleware, saleController.createSale);
router.get('/sales', authMiddleware, saleController.getSalesByDateAndCanteen); // Updated to filter by canteen and date
router.get('/sales', authMiddleware, saleController.getSales);
router.get('/sales/:id', authMiddleware, saleController.getSaleById);
router.put('/sales/:saleId', authMiddleware, saleController.updateSale); // Added route for updating sales

module.exports = router;