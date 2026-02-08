const express = require('express');
const router = express.Router();
const supplyController = require('../controllers/supplyController');
const authMiddleware = require('../middleware/auth');

// Supply routes
router.post('/supplies', authMiddleware, supplyController.createSupply);
router.get('/supplies', authMiddleware, supplyController.getSupplies);
router.get('/supplies/:id', authMiddleware, supplyController.getSupplyById);
router.put('/supplies/:id', authMiddleware, supplyController.updateSupply);
router.delete('/supplies/:supplyId/items/:itemId', authMiddleware, supplyController.removeSupplyItem);
router.get('/supplies/from/:canteenId', authMiddleware, supplyController.getSuppliesFromCanteen);
router.get('/supplies/to/:canteenId', authMiddleware, supplyController.getSuppliesToCanteen);
router.get('/supplies/canteen/:canteen_id/item/:item_id/month', authMiddleware, supplyController.getSuppliesByItemAndMonth);
module.exports = router;