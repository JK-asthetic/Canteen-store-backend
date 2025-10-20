const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const stockHistorySchema = new Schema({
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
  date: {
    type: Date,
    default: Date.now
  },
  opening_stock: {
    type: Number,
    required: true
  },
  received_stock: {
    type: Number,
    default: 0
  },
  sold_stock: {
    type: Number,
    default: 0
  },
  closing_stock: {
    type: Number,
    required: true
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

// Compound index for item-date lookups
stockHistorySchema.index({ canteen_id: 1, item_id: 1, date: 1 });

module.exports = mongoose.model('StockHistory', stockHistorySchema);
