const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/auth'); // You'll need to create this

router.post('/users', userController.createUser);
router.get('/users', authMiddleware, userController.getUsers);
router.get('/users/:id', authMiddleware, userController.getUserById);
router.put('/users/:id', authMiddleware, userController.updateUser);
router.delete('/users/:id', authMiddleware, userController.deleteUser);

module.exports = router;