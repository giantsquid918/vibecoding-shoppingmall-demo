const crypto = require('node:crypto');
const mongoose = require('mongoose');

const fulfillmentStatuses = [
  'pending',
  'preparing',
  'shipped',
  'delivered',
  'cancelled',
];
const paymentMethods = [
  'card',
  'bank_transfer',
  'virtual_account',
  'mobile_payment',
];
const paymentStatuses = [
  'pending',
  'paid',
  'failed',
  'cancelled',
  'refunded',
];

function generateOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `ORD-${date}-${randomSuffix}`;
}

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: null,
  },
  productId: {
    type: String,
    required: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  image: {
    type: String,
    required: true,
    trim: true,
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    validate: {
      validator: Number.isInteger,
      message: 'Quantity must be an integer',
    },
  },
  lineTotal: {
    type: Number,
    required: true,
    min: 0,
  },
});

const customerSnapshotSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: /^\S+@\S+\.\S+$/,
    },
  },
  { _id: false },
);

const shippingAddressSchema = new mongoose.Schema(
  {
    recipientName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    postalCode: {
      type: String,
      required: true,
      trim: true,
    },
    address1: {
      type: String,
      required: true,
      trim: true,
    },
    address2: {
      type: String,
      trim: true,
      default: '',
    },
    deliveryNote: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false },
);

const amountsSchema = new mongoose.Schema(
  {
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    shippingFee: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    discountAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  {
    method: {
      type: String,
      required: true,
      enum: paymentMethods,
    },
    status: {
      type: String,
      required: true,
      enum: paymentStatuses,
      default: 'pending',
    },
    provider: {
      type: String,
      trim: true,
      default: '',
    },
    transactionId: {
      type: String,
      trim: true,
      default: '',
    },
    paidAt: {
      type: Date,
      default: null,
    },
    virtualAccount: {
      bankName: {
        type: String,
        trim: true,
        default: '',
      },
      accountNumber: {
        type: String,
        trim: true,
        default: '',
      },
      holder: {
        type: String,
        trim: true,
        default: '',
      },
      expiresAt: {
        type: Date,
        default: null,
      },
    },
  },
  { _id: false },
);

const shippingSchema = new mongoose.Schema(
  {
    carrier: {
      type: String,
      trim: true,
      default: '',
    },
    trackingNumber: {
      type: String,
      trim: true,
      default: '',
    },
    shippedAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const statusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    required: true,
    enum: fulfillmentStatuses,
  },
  changedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  note: {
    type: String,
    trim: true,
    default: '',
  },
});

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      default: generateOrderNumber,
    },
    checkoutKey: {
      type: String,
      trim: true,
      default: undefined,
      unique: true,
      sparse: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    customerSnapshot: {
      type: customerSnapshotSchema,
      required: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      default: undefined,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: 'An order must contain at least one item',
      },
    },
    shippingAddress: {
      type: shippingAddressSchema,
      required: true,
    },
    amounts: {
      type: amountsSchema,
      required: true,
      default: () => ({}),
    },
    payment: {
      type: paymentSchema,
      required: true,
    },
    fulfillmentStatus: {
      type: String,
      required: true,
      enum: fulfillmentStatuses,
      default: 'pending',
    },
    shipping: {
      type: shippingSchema,
      default: () => ({}),
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },
  },
  { timestamps: true },
);

orderSchema.pre('validate', function () {
  const items = this.items || [];
  if (!this.amounts) this.amounts = {};

  const subtotal = items.reduce((total, item) => {
    item.lineTotal = item.unitPrice * item.quantity;
    return total + item.lineTotal;
  }, 0);

  this.amounts.subtotal = subtotal;
  this.amounts.shippingFee = subtotal < 50000 ? 2500 : 0;
  this.amounts.totalAmount =
    subtotal + this.amounts.shippingFee - this.amounts.discountAmount;
});

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ fulfillmentStatus: 1, createdAt: -1 });

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
