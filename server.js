// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import routes
const routes = require('./routes');

const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(compression()); // Compress responses
app.use(morgan('dev')); // Request logging
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Routes - keep your original base path
app.use('/canteen_store', routes);

// 404 handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({ 
    error: err.message || 'Something broke!',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// MongoDB connection string from environment variables or fallback
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/canteen_store';

// Connect to MongoDB and start server
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

module.exports = app; // Export for testing