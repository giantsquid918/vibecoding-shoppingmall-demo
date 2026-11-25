const assert = require('node:assert/strict');
const test = require('node:test');
const adminController = require('../controllers/adminController');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

function createResponse() {
  return {
    body: null,
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('returns dashboard counts and revenue from paid orders', async () => {
  const originalOrderCount = Order.countDocuments;
  const originalProductCount = Product.countDocuments;
  const originalUserCount = User.countDocuments;
  const originalOrderAggregate = Order.aggregate;
  Order.countDocuments = async () => 12;
  Product.countDocuments = async () => 8;
  User.countDocuments = async (filter) => {
    assert.deepEqual(filter, { user_type: 'customer' });
    return 5;
  };
  Order.aggregate = async (pipeline) => {
    assert.deepEqual(pipeline, [
      { $match: { 'payment.status': 'paid' } },
      { $group: { _id: null, totalRevenue: { $sum: '$amounts.totalAmount' } } },
    ]);
    return [{ totalRevenue: 72500 }];
  };

  try {
    const res = createResponse();
    await adminController.getDashboardStats({}, res, (error) => { throw error; });

    assert.deepEqual(res.body, {
      totalOrders: 12,
      totalProducts: 8,
      totalCustomers: 5,
      totalRevenue: 72500,
    });
  } finally {
    Order.countDocuments = originalOrderCount;
    Product.countDocuments = originalProductCount;
    User.countDocuments = originalUserCount;
    Order.aggregate = originalOrderAggregate;
  }
});

test('reports zero revenue when there are no paid orders', async () => {
  const originalOrderCount = Order.countDocuments;
  const originalProductCount = Product.countDocuments;
  const originalUserCount = User.countDocuments;
  const originalOrderAggregate = Order.aggregate;
  Order.countDocuments = async () => 0;
  Product.countDocuments = async () => 0;
  User.countDocuments = async () => 0;
  Order.aggregate = async () => [];

  try {
    const res = createResponse();
    await adminController.getDashboardStats({}, res, (error) => { throw error; });

    assert.equal(res.body.totalRevenue, 0);
  } finally {
    Order.countDocuments = originalOrderCount;
    Product.countDocuments = originalProductCount;
    User.countDocuments = originalUserCount;
    Order.aggregate = originalOrderAggregate;
  }
});
