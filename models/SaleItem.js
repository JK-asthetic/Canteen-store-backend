const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const saleItemSchema = new Schema({
  sale_id: {
    type: Schema.Types.ObjectId,
    ref: 'Sale',
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
  unit_price: {
    type: Number,
    required: true
  },
  total_price: {
    type: Number,
    required: true
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('SaleItem', saleItemSchema);