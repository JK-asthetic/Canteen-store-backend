// At the end of models/SupplyItem.js
const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const supplyItemSchema = new Schema({
  supply_id: {
    type: Schema.Types.ObjectId,
    ref: "Supply",
    required: true,
  },
  item_id: {
    type: Schema.Types.ObjectId,
    ref: "Item",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    // Can be negative for corrections
  },
  unit_price: {
    type: Number,
    required: true,
  },
  created_by: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("SupplyItem", supplyItemSchema); // Make sure this line exists
