const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const Order = require('../models/Order');

function createOrder(overrides = {}) {
  return new Order({
    user: new mongoose.Types.ObjectId(),
    customerSnapshot: {
      name: '홍길동',
      email: 'user@example.com',
    },
    items: [{
      product: new mongoose.Types.ObjectId(),
      productId: 'SKU-001',
      name: '상품',
      image: '/product.jpg',
      unitPrice: 30000,
      quantity: 1,
    }],
    shippingAddress: {
      recipientName: '홍길동',
      phone: '010-1234-5678',
      postalCode: '12345',
      address1: '서울시 강남구',
    },
    payment: { method: 'card' },
    ...overrides,
  });
}

test('creates an order number and calculates item and shipping amounts', async () => {
  const order = createOrder({
    items: [
      {
        productId: 'SKU-001',
        name: '상품',
        image: '/product.jpg',
        unitPrice: 30000,
        quantity: 2,
      },
    ],
  });

  await order.validate();

  assert.match(order.orderNumber, /^ORD-\d{8}-[A-F0-9]{8}$/);
  assert.equal(order.items[0].lineTotal, 60000);
  assert.equal(order.amounts.subtotal, 60000);
  assert.equal(order.amounts.shippingFee, 0);
  assert.equal(order.amounts.totalAmount, 60000);
  assert.equal(order.payment.status, 'pending');
  assert.equal(order.fulfillmentStatus, 'pending');
});

test('charges shipping below 50000 and includes the discount in the total', async () => {
  const order = createOrder({
    items: [{
      productId: 'SKU-001',
      name: '상품',
      image: '/product.jpg',
      unitPrice: 3000,
      quantity: 1,
    }],
    amounts: { discountAmount: 500 },
  });

  await order.validate();

  assert.equal(order.amounts.subtotal, 3000);
  assert.equal(order.amounts.shippingFee, 2500);
  assert.equal(order.amounts.totalAmount, 5000);
});

test('requires a customer, nonempty items, address, and valid payment method', async () => {
  const order = new Order({
    items: [],
    payment: { method: 'unknown' },
  });
  const error = await order.validate().then(
    () => null,
    (validationError) => validationError,
  );

  assert.ok(error);
  assert.ok(error.errors.user);
  assert.ok(error.errors.customerSnapshot);
  assert.ok(error.errors.items);
  assert.ok(error.errors.shippingAddress);
  assert.ok(error.errors['payment.method']);
});

test('indexes order numbers uniquely and supports user order history', () => {
  const indexes = Order.schema.indexes();
  const orderNumberIndex = indexes.find(([keys]) => keys.orderNumber === 1);
  const userHistoryIndex = indexes.find(
    ([keys]) => keys.user === 1 && keys.createdAt === -1,
  );

  assert.ok(orderNumberIndex);
  assert.equal(orderNumberIndex[1].unique, true);
  assert.ok(userHistoryIndex);
});
