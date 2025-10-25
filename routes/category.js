const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const authMiddleware = require('../middleware/auth');

// Category routes
router.post('/categories', authMiddleware, categoryController.createCategory);
router.get('/categories', authMiddleware, categoryController.getCategories);
router.get('/categories/:id', authMiddleware, categoryController.getCategoryById);
router.put('/categories/:id', authMiddleware, categoryController.updateCategory);
router.delete('/categories/:id', authMiddleware, categoryController.deleteCategory);

module.exports = router;
