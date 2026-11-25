const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const Cart = require('../models/Cart');

test('accepts a cart with product references and positive integer quantities', () => {
  const productId = new mongoose.Types.ObjectId();
  const cart = new Cart({
    user: new mongoose.Types.ObjectId(),
    items: [{ product: productId, unitPrice: 10000, quantity: 2 }],
  });

  assert.equal(cart.validateSync(), undefined);
  assert.equal(cart.items[0].product.toString(), productId.toString());
  assert.equal(cart.items[0].lineTotal, 20000);
  assert.equal(cart.totalAmount, 20000);
  assert.equal(cart.toJSON().totalAmount, 20000);
});

test('requires a user and product and rejects invalid quantities', () => {
  const cart = new Cart({
    items: [
      { quantity: 0 },
      { product: new mongoose.Types.ObjectId(), unitPrice: 10000, quantity: 1.5 },
      { product: new mongoose.Types.ObjectId(), unitPrice: -1, quantity: 1 },
    ],
  });
  const error = cart.validateSync();

  assert.ok(error);
  assert.ok(error.errors.user);
  assert.ok(error.errors['items.0.product']);
  assert.equal(error.errors['items.0.quantity'].kind, 'min');
  assert.equal(error.errors['items.1.quantity'].message, 'Quantity must be an integer');
  assert.equal(error.errors['items.2.unitPrice'].kind, 'min');
});

test('returns zero for an empty cart total', () => {
  const cart = new Cart({ user: new mongoose.Types.ObjectId() });

  assert.equal(cart.totalAmount, 0);
});

test('creates a unique database index for each user cart', () => {
  const userIndex = Cart.schema
    .indexes()
    .find(([keys]) => keys.user === 1);

  assert.ok(userIndex);
  assert.equal(userIndex[1].unique, true);
});
