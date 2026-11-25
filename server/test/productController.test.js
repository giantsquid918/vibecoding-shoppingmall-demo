const assert = require('node:assert/strict');
const test = require('node:test');
const Order = require('../models/Order');
const Product = require('../models/Product');
const productController = require('../controllers/productController');

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('creates a product and ignores fields outside the product schema', async () => {
  const originalSave = Product.prototype.save;
  Product.prototype.save = async function () { return this; };
  try {
    const res = createResponse();
    await productController.createProduct(
      {
        body: {
          productId: 'TOP-100',
          name: '코튼 티셔츠',
          price: 25900,
          category: '상의',
          image: '/images/top-100.jpg',
          description: '기본 티셔츠',
          isAdmin: true,
        },
      },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.productId, 'TOP-100');
    assert.equal(res.body.isAdmin, undefined);
  } finally {
    Product.prototype.save = originalSave;
  }
});

test('updates a product by product ID', async () => {
  const originalFindOne = Product.findOne;
  const product = {
    productId: 'TOP-100',
    name: '기존 상품명',
    save: async function () { return this; },
  };
  Product.findOne = async (filter) => {
    assert.deepEqual(filter, { productId: 'TOP-100' });
    return product;
  };
  try {
    const res = createResponse();
    await productController.updateProduct(
      { params: { productId: 'TOP-100' }, body: { name: '변경된 상품명' } },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.body.name, '변경된 상품명');
  } finally {
    Product.findOne = originalFindOne;
  }
});

test('returns all products ordered by creation time', async () => {
  const originalFind = Product.find;
  const products = [{ productId: 'TOP-100' }, { productId: 'PANTS-200' }];
  Product.find = () => ({
    sort(sortOrder) {
      assert.deepEqual(sortOrder, { createdAt: -1 });
      return Promise.resolve(products);
    },
  });

  try {
    const res = createResponse();
    await productController.getProducts({}, res, (error) => { throw error; });

    assert.deepEqual(res.body, products);
  } finally {
    Product.find = originalFind;
  }
});

test('orders products by paid, non-cancelled units and ranks only the top three sold products', async () => {
  const originalFind = Product.find;
  const originalAggregate = Order.aggregate;
  const products = [
    { _id: 'newest', productId: 'NEW' },
    { _id: 'first', productId: 'FIRST' },
    { _id: 'tied', productId: 'TIED' },
    { _id: 'third', productId: 'THIRD' },
    { _id: 'fourth', productId: 'FOURTH' },
  ];
  Product.find = () => ({
    sort(sortOrder) {
      assert.deepEqual(sortOrder, { createdAt: -1, _id: -1 });
      return { lean: async () => products };
    },
  });
  Order.aggregate = async (pipeline) => {
    assert.deepEqual(pipeline, [
      { $match: { 'payment.status': 'paid', fulfillmentStatus: { $ne: 'cancelled' } } },
      { $unwind: '$items' },
      { $match: { 'items.product': { $ne: null } } },
      { $group: { _id: '$items.product', quantity: { $sum: '$items.quantity' } } },
    ]);
    return [
      { _id: 'first', quantity: 8 },
      { _id: 'tied', quantity: 8 },
      { _id: 'third', quantity: 3 },
      { _id: 'fourth', quantity: 1 },
      { _id: 'deleted', quantity: 100 },
    ];
  };
  try {
    const res = createResponse();
    await productController.getProducts(
      { query: { sort: 'best-selling' } }, res, (error) => { throw error; },
    );
    assert.deepEqual(
      res.body.map(({ productId, salesRank }) => [productId, salesRank]),
      [['FIRST', 1], ['TIED', 2], ['THIRD', 3], ['FOURTH', null], ['NEW', null]],
    );
  } finally {
    Product.find = originalFind;
    Order.aggregate = originalAggregate;
  }
});

test('does not rank products when there are no sales', async () => {
  const originalFind = Product.find;
  const originalAggregate = Order.aggregate;
  Product.find = () => ({
    sort: () => ({ lean: async () => [{ _id: 'one' }, { _id: 'two' }] }),
  });
  Order.aggregate = async () => [];
  try {
    const res = createResponse();
    await productController.getProducts(
      { query: { sort: 'best-selling' } }, res, (error) => { throw error; },
    );
    assert.deepEqual(res.body.map((product) => product.salesRank), [null, null]);
  } finally {
    Product.find = originalFind;
    Order.aggregate = originalAggregate;
  }
});

test('forwards errors when best-selling data cannot be loaded', async () => {
  const originalFind = Product.find;
  const originalAggregate = Order.aggregate;
  const failure = new Error('database unavailable');
  Product.find = () => ({ sort: () => ({ lean: async () => [] }) });
  Order.aggregate = async () => { throw failure; };
  try {
    let receivedError;
    await productController.getProducts(
      { query: { sort: 'best-selling' } }, createResponse(),
      (error) => { receivedError = error; },
    );
    assert.equal(receivedError, failure);
  } finally {
    Product.find = originalFind;
    Order.aggregate = originalAggregate;
  }
});

test('returns 404 when a product ID does not exist', async () => {
  const originalFindOne = Product.findOne;
  Product.findOne = async () => null;
  try {
    const res = createResponse();
    await productController.getProduct(
      { params: { productId: 'UNKNOWN' } },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.statusCode, 404);
    assert.equal(res.body.message, 'Product not found');
  } finally {
    Product.findOne = originalFindOne;
  }
});
