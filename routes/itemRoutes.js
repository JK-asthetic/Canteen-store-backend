const express = require('express');
const router = express.Router();
const itemController = require('../controllers/itemController');
const authMiddleware = require('../middleware/auth');

// Item routes
router.post('/items', authMiddleware, itemController.createItem);
router.get('/items', authMiddleware, itemController.getItems);
router.get('/items/:id', authMiddleware, itemController.getItemById);
router.put('/items/:id', authMiddleware, itemController.updateItem);
router.delete('/items/:id', authMiddleware, itemController.deleteItem);

module.exports = router;
