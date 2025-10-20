const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const saleSchema = new Schema({
  canteen_id: {
    type: Schema.Types.ObjectId,
    ref: 'Canteen',
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  total_amount: {
    type: Number,
    required: true
  },
  cash_amount: {
    type: Number,
    default: 0,
    required: true
  },
  online_amount: {
    type: Number,
    default: 0,
    required: true
  },
  created_by: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Add a pre-save validation to ensure cash + online equals total
saleSchema.pre('save', function(next) {
  const roundToTwo = num => Math.round((num + Number.EPSILON) * 100) / 100;
  
  // Round to 2 decimal places to avoid floating point issues
  const cashRounded = roundToTwo(this.cash_amount);
  const onlineRounded = roundToTwo(this.online_amount);
  const totalRounded = roundToTwo(this.total_amount);
  
  // Validate that cash + online = total (with rounding tolerance)
  if (Math.abs(cashRounded + onlineRounded - totalRounded) > 0.01) {
    return next(new Error('Cash amount plus online amount must equal total amount'));
  }
  
  next();
});

module.exports = mongoose.model('Sale', saleSchema);