// At the end of models/Supply.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const supplySchema = new Schema({
  from_canteen_id: {
    type: Schema.Types.ObjectId,
    ref: 'Canteen',
    required: true
  },
  to_canteen_id: {
    type: Schema.Types.ObjectId,
    ref: 'Canteen',
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  created_by: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  is_locked: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

module.exports = mongoose.model('Supply', supplySchema);  // Make sure this line exists