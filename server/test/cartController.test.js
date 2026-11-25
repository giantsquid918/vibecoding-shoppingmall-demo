const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const cartController = require('../controllers/cartController');

function createResponse() {
  return {
    statusCode: null,
    body: null,
    ended: false,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function mockCartPersistence(cart) {
  const originalFindOne = Cart.findOne;
  const originalSave = Cart.prototype.save;
  const originalPopulate = Cart.prototype.populate;
  Cart.findOne = async (filter) => {
    assert.equal(String(filter.user), String(cart.user));
    return cart;
  };
  Cart.prototype.save = async function () { return this; };
  Cart.prototype.populate = async function () { return this; };

  return () => {
    Cart.findOne = originalFindOne;
    Cart.prototype.save = originalSave;
    Cart.prototype.populate = originalPopulate;
  };
}

test('adds an authenticated user product and calculates its total', async () => {
  const userId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();
  const cart = new Cart({ user: userId, items: [] });
  const originalProductFindOne = Product.findOne;
  Product.findOne = async (filter) => {
    assert.deepEqual(filter, { productId: 'SKU-100' });
    return { _id: productId, price: 10000 };
  };
  const restoreCart = mockCartPersistence(cart);

  try {
    const res = createResponse();
    await cartController.addItem(
      { auth: { userId: String(userId) }, body: { productId: 'SKU-100', quantity: 2 } },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.items[0].unitPrice, 10000);
    assert.equal(res.body.items[0].lineTotal, 20000);
    assert.equal(res.body.totalAmount, 20000);
  } finally {
    Product.findOne = originalProductFindOne;
    restoreCart();
  }
});

test('updates and removes only the authenticated user cart item', async () => {
  const userId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();
  const cart = new Cart({
    user: userId,
    items: [{ product: productId, unitPrice: 10000, quantity: 1 }],
  });
  const originalProductFindOne = Product.findOne;
  Product.findOne = async () => ({ _id: productId });
  const restoreCart = mockCartPersistence(cart);

  try {
    const updateResponse = createResponse();
    await cartController.updateItem(
      {
        auth: { userId: String(userId) },
        body: { quantity: 3 },
        params: { productId: 'SKU-100' },
      },
      updateResponse,
      (error) => { throw error; },
    );
    assert.equal(updateResponse.body.items[0].quantity, 3);
    assert.equal(updateResponse.body.totalAmount, 30000);

    const deleteResponse = createResponse();
    await cartController.deleteItem(
      { auth: { userId: String(userId) }, params: { productId: 'SKU-100' } },
      deleteResponse,
      (error) => { throw error; },
    );
    assert.equal(deleteResponse.body.items.length, 0);
    assert.equal(deleteResponse.body.totalAmount, 0);
  } finally {
    Product.findOne = originalProductFindOne;
    restoreCart();
  }
});

test('rejects invalid quantities before database access', async () => {
  const originalProductFindOne = Product.findOne;
  Product.findOne = async () => {
    throw new Error('Product lookup should not run');
  };

  try {
    const res = createResponse();
    await cartController.addItem(
      { auth: { userId: 'user-id' }, body: { productId: 'SKU-100', quantity: 0 } },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Quantity must be a positive integer');
  } finally {
    Product.findOne = originalProductFindOne;
  }
});
