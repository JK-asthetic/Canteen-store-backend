const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const canteenSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['main', 'sub'],
    required: true
  },
  location: {
    type: String,
    required: true
  },
  contact_number: {
    type: String,
    required: true
  },
  // Lock system fields
  is_locked: {
    type: Boolean,
    default: false
  },
  locked_at: {
    type: Date,
    default: null
  },
  locked_by: {
    type: Schema.Types.ObjectId,
    ref: 'User', // Assuming you have a User model for admins
    default: null
  },
  lock_reason: {
    type: String,
    default: null
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});

// Method to check if canteen should be auto-unlocked
canteenSchema.methods.shouldAutoUnlock = function() {
  if (!this.is_locked || !this.locked_at) {
    return false;
  }
  
  const now = new Date();
  const lockedDate = new Date(this.locked_at);
  
  // Check if it's a new day (different date)
  return now.toDateString() !== lockedDate.toDateString();
};

// Method to auto-unlock if needed
canteenSchema.methods.autoUnlockIfNeeded = async function() {
  if (this.shouldAutoUnlock()) {
    this.is_locked = false;
    this.locked_at = null;
    this.locked_by = null;
    this.lock_reason = null;
    await this.save();
    return true;
  }
  return false;
};

// Pre-find middleware to auto-unlock canteens
canteenSchema.pre(/^find/, async function() {
  // Auto-unlock canteens that should be unlocked
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  await this.model.updateMany(
    {
      is_locked: true,
      locked_at: { $lt: startOfToday }
    },
    {
      $set: {
        is_locked: false,
        locked_at: null,
        locked_by: null,
        lock_reason: null
      }
    }
  );
});

module.exports = mongoose.model('Canteen', canteenSchema);