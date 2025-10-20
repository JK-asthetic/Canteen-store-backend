const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const stockSchema = new Schema({
  canteen_id: {
    type: Schema.Types.ObjectId,
    ref: 'Canteen',
    required: true
  },
  item_id: {
    type: Schema.Types.ObjectId,
    ref: 'Item',
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  updated_at: {
    type: Date,
    default: Date.now
  }
});

// Create a compound index for canteen_id and item_id to ensure uniqueness
stockSchema.index({ canteen_id: 1, item_id: 1 }, { unique: true });

module.exports = mongoose.model('Stock', stockSchema);
