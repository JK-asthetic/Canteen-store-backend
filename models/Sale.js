const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const saleSchema = new Schema(
  {
    canteen_id: {
      type: Schema.Types.ObjectId,
      ref: "Canteen",
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    total_amount: {
      type: Number,
      required: true,
    },
    cash_amount: {
      type: Number,
      default: 0,
      required: true,
    },
    online_amount: {
      type: Number,
      default: 0,
      required: true,
    },
    other_amount: {
      type: Number,
      default: 0,
      required: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    // Adjustment FROM previous day
    previous_day_adjustment: {
      type: Number,
      default: 0,
    },
    previous_day_reason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    // Adjustment FOR next day (set during verification)
    next_day_adjustment: {
      type: Number,
      default: 0,
    },
    next_day_reason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    verified_by: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    verified_at: {
      type: Date,
    },
    created_by: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

// Add a pre-save validation to ensure cash + online + other equals total
saleSchema.pre("save", function (next) {
  const roundToTwo = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

  const cashRounded = roundToTwo(this.cash_amount);
  const onlineRounded = roundToTwo(this.online_amount);
  const otherRounded = roundToTwo(this.other_amount);
  const totalRounded = roundToTwo(this.total_amount);

  if (
    Math.abs(cashRounded + onlineRounded + otherRounded - totalRounded) > 0.01
  ) {
    return next(
      new Error(
        "Cash amount plus online amount plus other amount must equal total amount"
      )
    );
  }

  next();
});

module.exports = mongoose.model("Sale", saleSchema);
