const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  quantity: {
    type: Number,
    required: true,
    default: 1,
    min: 1,
    validate: {
      validator: Number.isInteger,
      message: 'Quantity must be an integer',
    },
  },
});

cartItemSchema.virtual('lineTotal').get(function () {
  return this.unitPrice * this.quantity;
});

const cartSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

cartSchema.virtual('totalAmount').get(function () {
  return this.items.reduce((total, item) => total + item.lineTotal, 0);
});

module.exports = mongoose.models.Cart || mongoose.model('Cart', cartSchema);
