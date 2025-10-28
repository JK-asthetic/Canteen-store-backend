const express = require('express');
const router = express.Router();

// Import all route files
const userRoutes = require('./userRoutes');
const canteenRoutes = require('./canteenRoutes');
const itemRoutes = require('./itemRoutes');
const stockRoutes = require('./stockRoutes');
const supplyRoutes = require('./supplyRoutes');
const saleRoutes = require('./saleRoutes');
const authRoutes = require('./authRoutes');
const categoryRoutes = require('./category');
const unitRoutes = require('./unit');
const timeRoutes = require('./timeRoutes');
// Register all routes
router.use('/auth', authRoutes);
router.use(userRoutes);
router.use(canteenRoutes);
router.use(itemRoutes);
router.use(stockRoutes);
router.use(supplyRoutes);
router.use(saleRoutes);
router.use(categoryRoutes);
router.use(unitRoutes);
router.use(timeRoutes);

// Export the router
module.exports = router;