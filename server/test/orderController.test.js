const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const User = require('../models/User');
const orderController = require('../controllers/orderController');

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

function setEnvironment(values) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }

  return () => {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  };
}

test('lists only the authenticated user orders in newest-first order', async () => {
  const userId = new mongoose.Types.ObjectId();
  const orders = [{
    orderNumber: 'ORD-20261122-ABC12345',
    items: [{ productId: 'SKU-100', name: '상품', image: '/product.jpg', quantity: 1 }],
    amounts: { totalAmount: 5500 },
    customerSnapshot: { name: '홍길동', email: 'user@example.com' },
    shippingAddress: {},
    payment: { status: 'paid' },
    fulfillmentStatus: 'preparing',
    createdAt: new Date('2026-11-22T00:00:00.000Z'),
  }];
  const originalFind = Order.find;
  Order.find = (filter) => {
    assert.deepEqual(filter, { user: String(userId) });
    return {
      sort: async (sortOrder) => {
        assert.deepEqual(sortOrder, { createdAt: -1 });
        return orders;
      },
    };
  };

  try {
    const res = createResponse();
    await orderController.listOrders(
      { auth: { userId: String(userId) } },
      res,
      (error) => { throw error; },
    );

    assert.deepEqual(res.body.orders.map((order) => order.orderNumber), [
      'ORD-20261122-ABC12345',
    ]);
    assert.equal(res.body.orders[0].fulfillmentStatus, 'preparing');
    assert.equal(res.body.orders[0].amounts.totalAmount, 5500);
  } finally {
    Order.find = originalFind;
  }
});

test('lists all admin orders with customer and shipping details', async () => {
  const orders = [{
    orderNumber: 'ORD-20261122-ADMIN01',
    items: [],
    amounts: { totalAmount: 12500 },
    customerSnapshot: { name: '관리자 조회 고객', email: 'customer@example.com' },
    shippingAddress: { address1: '서울시 강남구' },
    payment: { status: 'paid' },
    fulfillmentStatus: 'shipped',
    shipping: { carrier: '택배사', trackingNumber: 'TRACK-001' },
    statusHistory: [],
    createdAt: new Date('2026-11-22T00:00:00.000Z'),
  }];
  const originalFind = Order.find;
  Order.find = (filter) => {
    assert.equal(filter, undefined);
    return {
      sort: async (sortOrder) => {
        assert.deepEqual(sortOrder, { createdAt: -1 });
        return orders;
      },
    };
  };

  try {
    const res = createResponse();
    await orderController.listAdminOrders({}, res, (error) => { throw error; });

    assert.equal(res.body.orders[0].customerSnapshot.email, 'customer@example.com');
    assert.equal(res.body.orders[0].shipping.trackingNumber, 'TRACK-001');
  } finally {
    Order.find = originalFind;
  }
});

test('updates shipment tracking and starts shipping for paid orders', async () => {
  const userId = new mongoose.Types.ObjectId();
  const order = {
    orderNumber: 'ORD-20261122-SHIP01',
    items: [],
    amounts: { totalAmount: 12500 },
    customerSnapshot: {},
    shippingAddress: {},
    payment: { status: 'paid' },
    fulfillmentStatus: 'preparing',
    shipping: {},
    statusHistory: [],
    createdAt: new Date(),
    save: async () => order,
  };
  const originalFindOne = Order.findOne;
  Order.findOne = async (filter) => {
    assert.deepEqual(filter, { orderNumber: order.orderNumber });
    return order;
  };

  try {
    const res = createResponse();
    await orderController.updateOrderShipping(
      {
        auth: { userId: String(userId) },
        params: { orderNumber: order.orderNumber },
        body: { carrier: '한빛택배', trackingNumber: 'TRACK-2026' },
      },
      res,
      (error) => { throw error; },
    );

    assert.equal(order.fulfillmentStatus, 'shipped');
    assert.equal(order.shipping.carrier, '한빛택배');
    assert.equal(order.shipping.trackingNumber, 'TRACK-2026');
    assert.equal(order.statusHistory[0].changedBy, String(userId));
    assert.equal(res.body.order.fulfillmentStatus, 'shipped');
  } finally {
    Order.findOne = originalFindOne;
  }
});

test('changes order status and flags paid-order cancellation for refund handling', async () => {
  const userId = new mongoose.Types.ObjectId();
  const order = {
    orderNumber: 'ORD-20261122-CANCELPAID',
    items: [],
    amounts: { totalAmount: 12500 },
    customerSnapshot: {},
    shippingAddress: {},
    payment: { status: 'paid' },
    fulfillmentStatus: 'preparing',
    shipping: {},
    statusHistory: [],
    createdAt: new Date(),
    save: async () => order,
  };
  const originalFindOne = Order.findOne;
  Order.findOne = async () => order;

  try {
    const res = createResponse();
    await orderController.updateOrderStatus(
      {
        auth: { userId: String(userId) },
        params: { orderNumber: order.orderNumber },
        body: { fulfillmentStatus: 'cancelled' },
      },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.body.order.fulfillmentStatus, 'cancelled');
    assert.equal(res.body.refundRequired, true);
    assert.equal(order.payment.status, 'paid');
  } finally {
    Order.findOne = originalFindOne;
  }
});

test('removes an unpaid order when payment is cancelled without changing the cart', async () => {
  const userId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  const order = {
    _id: orderId,
    orderNumber: 'ORD-20261122-CANCEL1',
    payment: { status: 'pending', transactionId: '' },
  };
  const originalFindOne = Order.findOne;
  const originalDeleteOne = Order.deleteOne;
  Order.findOne = async (filter) => {
    assert.deepEqual(filter, {
      orderNumber: order.orderNumber,
      user: String(userId),
    });
    return order;
  };
  Order.deleteOne = async (filter) => {
    assert.deepEqual(filter, {
      _id: orderId,
      user: String(userId),
      'payment.status': 'pending',
      'payment.transactionId': '',
    });
    return { deletedCount: 1 };
  };

  try {
    const res = createResponse();
    await orderController.cancelOrder(
      {
        auth: { userId: String(userId) },
        params: { orderNumber: order.orderNumber },
      },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.body.paymentStatus, 'cancelled');
  } finally {
    Order.findOne = originalFindOne;
    Order.deleteOne = originalDeleteOne;
  }
});

test('removes an order after a confirmed payment failure and keeps the cart', async () => {
  const userId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  const order = {
    _id: orderId,
    orderNumber: 'ORD-20261122-FAILED1',
    amounts: { totalAmount: 5500 },
    payment: { status: 'pending', transactionId: '' },
  };
  const originalFindOne = Order.findOne;
  const originalDeleteOne = Order.deleteOne;
  const originalCartDelete = Cart.findOneAndDelete;
  const originalFetch = global.fetch;
  const originalConsoleWarn = console.warn;
  const restoreEnvironment = setEnvironment({
    PORTONE_API_KEY: 'test-key',
    PORTONE_API_SECRET: 'test-secret',
  });
  let cartWasCleared = false;
  Order.findOne = async () => order;
  Order.deleteOne = async (filter) => {
    assert.deepEqual(filter, {
      _id: orderId,
      user: String(userId),
      'payment.status': 'pending',
      'payment.transactionId': '',
    });
    return { deletedCount: 1 };
  };
  Cart.findOneAndDelete = async () => { cartWasCleared = true; };
  global.fetch = async (url) => {
    if (url.endsWith('/users/getToken')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 0, response: { access_token: 'portone-token' } }),
      };
    }
    if (url.endsWith('/paid') || url.endsWith('/ready')) {
      return {
        ok: false,
        status: 404,
        json: async () => ({ code: -1, message: 'Not found', response: null }),
      };
    }

    assert.equal(url, 'https://api.iamport.kr/payments/imp-failed');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        response: {
          imp_uid: 'imp-failed',
          merchant_uid: order.orderNumber,
          amount: 5500,
          status: 'failed',
        },
      }),
    };
  };
  console.warn = () => {};

  try {
    const res = createResponse();
    await orderController.verifyPayment(
      {
        auth: { userId: String(userId) },
        body: { imp_uid: 'imp-failed' },
        params: { orderNumber: order.orderNumber },
      },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.statusCode, 402);
    assert.equal(cartWasCleared, false);
  } finally {
    Order.findOne = originalFindOne;
    Order.deleteOne = originalDeleteOne;
    Cart.findOneAndDelete = originalCartDelete;
    global.fetch = originalFetch;
    console.warn = originalConsoleWarn;
    restoreEnvironment();
  }
});

test('creates a pending order from the authenticated user cart and profile', async () => {
  const userId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();
  const user = {
    _id: userId,
    username: '홍길동',
    email: 'user@example.com',
    phone: '01012345678',
  };
  const cart = {
    items: [{
      product: {
        _id: productId,
        productId: 'SKU-100',
        name: '상품',
        image: '/product.jpg',
      },
      unitPrice: 3000,
      quantity: 2,
    }],
  };
  const originalCartFindOne = Cart.findOne;
  const originalUserFindById = User.findById;
  const originalOrderFindOne = Order.findOne;
  const originalOrderFind = Order.find;
  const originalSave = Order.prototype.save;
  const restoreEnvironment = setEnvironment({
    PORTONE_API_KEY: 'test-key',
    PORTONE_API_SECRET: 'test-secret',
  });
  Cart.findOne = (filter) => ({
    populate(path) {
      assert.deepEqual(filter, { user: String(userId) });
      assert.equal(path, 'items.product');
      return Promise.resolve(cart);
    },
  });
  User.findById = async (id) => {
    assert.equal(String(id), String(userId));
    return user;
  };
  Order.findOne = async () => null;
  Order.find = () => ({ sort: async () => [] });
  Order.prototype.save = async function () {
    await this.validate();
    return this;
  };

  try {
    const res = createResponse();
    await orderController.createOrder(
      {
        auth: { userId: String(userId) },
        body: {
          checkoutKey: 'checkout-test-001',
          paymentMethod: 'card',
          shippingAddress: {
            recipientName: '받는 사람',
            postalCode: '12345',
            address1: '서울시 강남구',
            address2: '101호',
            deliveryNote: '문 앞에 두세요',
          },
        },
      },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.statusCode, 201);
    assert.match(res.body.orderNumber, /^ORD-/);
    assert.equal(res.body.customerSnapshot.name, '홍길동');
    assert.equal(res.body.shippingAddress.phone, '01012345678');
    assert.equal(res.body.items[0].productId, 'SKU-100');
    assert.equal(res.body.amounts.subtotal, 6000);
    assert.equal(res.body.amounts.shippingFee, 2500);
    assert.equal(res.body.amounts.totalAmount, 8500);
    assert.equal(res.body.payment.status, 'pending');
  } finally {
    Cart.findOne = originalCartFindOne;
    User.findById = originalUserFindById;
    Order.findOne = originalOrderFindOne;
    Order.find = originalOrderFind;
    Order.prototype.save = originalSave;
    restoreEnvironment();
  }
});

test('preflight reconciles a matching paid order before allowing another order', async () => {
  const userId = new mongoose.Types.ObjectId();
  const order = {
    orderNumber: 'ORD-20261122-PAID1234',
    user: userId,
    items: [{ productId: 'SKU-100', unitPrice: 3000, quantity: 2 }],
    amounts: { totalAmount: 8500 },
    payment: { method: 'card', status: 'pending', transactionId: '' },
    fulfillmentStatus: 'pending',
    statusHistory: { push() {} },
    save: async () => order,
  };
  const cart = {
    items: [{
      product: { productId: 'SKU-100' },
      unitPrice: 3000,
      quantity: 2,
    }],
  };
  const originalCartFindOne = Cart.findOne;
  const originalCartDelete = Cart.findOneAndDelete;
  const originalOrderFind = Order.find;
  const originalFetch = global.fetch;
  const restoreEnvironment = setEnvironment({
    PORTONE_API_KEY: 'test-key',
    PORTONE_API_SECRET: 'test-secret',
  });
  let cartWasCleared = false;
  Cart.findOne = (filter) => ({
    populate(path) {
      assert.deepEqual(filter, { user: String(userId) });
      assert.equal(path, 'items.product');
      return Promise.resolve(cart);
    },
  });
  Cart.findOneAndDelete = async () => { cartWasCleared = true; };
  Order.find = (filter) => {
    assert.deepEqual(filter, { user: String(userId), 'payment.status': 'pending' });
    return { sort: async () => [order] };
  };
  global.fetch = async (url) => {
    if (url.endsWith('/users/getToken')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 0, response: { access_token: 'portone-token' } }),
      };
    }

    assert.equal(
      url,
      `https://api.iamport.kr/payments/find/${order.orderNumber}/paid`,
    );
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        response: {
          imp_uid: 'imp-paid',
          merchant_uid: order.orderNumber,
          amount: 8500,
          status: 'paid',
        },
      }),
    };
  };

  try {
    const res = createResponse();
    await orderController.preflightOrder(
      {
        auth: { userId: String(userId) },
        body: {},
      },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.body.action, 'paid');
    assert.equal(res.body.order.orderNumber, order.orderNumber);
    assert.equal(order.payment.status, 'paid');
    assert.equal(order.payment.transactionId, 'imp-paid');
    assert.equal(cartWasCleared, true);
  } finally {
    Cart.findOne = originalCartFindOne;
    Cart.findOneAndDelete = originalCartDelete;
    Order.find = originalOrderFind;
    global.fetch = originalFetch;
    restoreEnvironment();
  }
});

test('preflight removes an abandoned order when PortOne has no payment and preserves the cart', async () => {
  const userId = new mongoose.Types.ObjectId();
  const orderId = new mongoose.Types.ObjectId();
  const order = {
    _id: orderId,
    orderNumber: 'ORD-20261122-ABANDON',
    items: [{ productId: 'SKU-100', unitPrice: 3000, quantity: 1 }],
    payment: { status: 'pending', transactionId: '' },
  };
  const cart = {
    items: [{
      product: { productId: 'SKU-100' },
      unitPrice: 3000,
      quantity: 1,
    }],
  };
  const originalCartFindOne = Cart.findOne;
  const originalCartDelete = Cart.findOneAndDelete;
  const originalOrderFind = Order.find;
  const originalOrderDelete = Order.deleteOne;
  const originalFetch = global.fetch;
  const originalConsoleWarn = console.warn;
  const restoreEnvironment = setEnvironment({
    PORTONE_API_KEY: 'test-key',
    PORTONE_API_SECRET: 'test-secret',
  });
  let cartWasCleared = false;
  Cart.findOne = (filter) => ({
    populate(path) {
      assert.deepEqual(filter, { user: String(userId) });
      assert.equal(path, 'items.product');
      return Promise.resolve(cart);
    },
  });
  Cart.findOneAndDelete = async () => { cartWasCleared = true; };
  Order.find = (filter) => {
    assert.deepEqual(filter, { user: String(userId), 'payment.status': 'pending' });
    return { sort: async () => [order] };
  };
  Order.deleteOne = async (filter) => {
    assert.deepEqual(filter, {
      _id: orderId,
      user: String(userId),
      'payment.status': 'pending',
      'payment.transactionId': '',
    });
    return { deletedCount: 1 };
  };
  global.fetch = async (url) => {
    if (url.endsWith('/users/getToken')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 0, response: { access_token: 'portone-token' } }),
      };
    }

    assert.match(url, /\/payments\/find\/.+\/(paid|ready)$/);
    return {
      ok: false,
      status: 404,
      json: async () => ({ code: -1, message: 'Not found', response: null }),
    };
  };
  console.warn = () => {};

  try {
    const res = createResponse();
    await orderController.preflightOrder(
      { auth: { userId: String(userId) }, body: {} },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.body.action, 'create');
    assert.equal(cartWasCleared, false);
  } finally {
    Cart.findOne = originalCartFindOne;
    Cart.findOneAndDelete = originalCartDelete;
    Order.find = originalOrderFind;
    Order.deleteOne = originalOrderDelete;
    global.fetch = originalFetch;
    console.warn = originalConsoleWarn;
    restoreEnvironment();
  }
});

test('rejects a second order for the same cart while a matching order is pending', async () => {
  const userId = new mongoose.Types.ObjectId();
  const pendingOrder = {
    orderNumber: 'ORD-20261122-PENDING1',
    items: [{ productId: 'SKU-100', unitPrice: 3000, quantity: 2 }],
    payment: { status: 'pending' },
  };
  const cart = {
    items: [{
      product: {
        _id: new mongoose.Types.ObjectId(),
        productId: 'SKU-100',
        name: '상품',
        image: '/product.jpg',
      },
      unitPrice: 3000,
      quantity: 2,
    }],
  };
  const originalCartFindOne = Cart.findOne;
  const originalUserFindById = User.findById;
  const originalOrderFindOne = Order.findOne;
  const originalOrderFind = Order.find;
  const restoreEnvironment = setEnvironment({
    PORTONE_API_KEY: 'test-key',
    PORTONE_API_SECRET: 'test-secret',
  });
  Cart.findOne = () => ({
    populate: async () => cart,
  });
  User.findById = async () => ({
    _id: userId,
    username: '홍길동',
    email: 'user@example.com',
    phone: '01012345678',
  });
  Order.findOne = async () => null;
  Order.find = () => ({ sort: async () => [pendingOrder] });

  try {
    const res = createResponse();
    await orderController.createOrder(
      {
        auth: { userId: String(userId) },
        body: {
          checkoutKey: 'checkout-test-new',
          paymentMethod: 'card',
          shippingAddress: {
            recipientName: '받는 사람',
            postalCode: '12345',
            address1: '서울시 강남구',
          },
        },
      },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.orderNumber, pendingOrder.orderNumber);
    assert.match(res.body.message, /미완료 주문/);
  } finally {
    Cart.findOne = originalCartFindOne;
    User.findById = originalUserFindById;
    Order.findOne = originalOrderFindOne;
    Order.find = originalOrderFind;
    restoreEnvironment();
  }
});

test('verifies PortOne merchant, amount, and paid status before clearing cart', async () => {
  const userId = new mongoose.Types.ObjectId();
  const order = {
    orderNumber: 'ORD-20261122-ABC12345',
    user: userId,
    items: [],
    amounts: { subtotal: 10000, shippingFee: 2500, discountAmount: 0, totalAmount: 12500 },
    customerSnapshot: { name: '홍길동', email: 'user@example.com' },
    shippingAddress: {},
    payment: { method: 'card', status: 'pending', transactionId: '' },
    fulfillmentStatus: 'pending',
    statusHistory: { push: (entry) => order.statusHistoryEntry = entry },
    save: async () => order,
  };
  const originalFindOne = Order.findOne;
  const originalCartDelete = Cart.findOneAndDelete;
  const originalFetch = global.fetch;
  const restoreEnvironment = setEnvironment({
    PORTONE_API_KEY: 'test-key',
    PORTONE_API_SECRET: 'test-secret',
  });
  let fetchCount = 0;
  let cartWasCleared = false;
  Order.findOne = async (filter) => {
    assert.deepEqual(filter, {
      orderNumber: order.orderNumber,
      user: String(userId),
    });
    return order;
  };
  Cart.findOneAndDelete = async (filter) => {
    assert.deepEqual(filter, { user: String(userId) });
    cartWasCleared = true;
  };
  global.fetch = async (url, options) => {
    fetchCount += 1;
    if (fetchCount === 1) {
      assert.equal(url, 'https://api.iamport.kr/users/getToken');
      assert.equal(options.method, 'POST');
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: '0', response: { access_token: 'portone-token' } }),
      };
    }

    assert.equal(
      url,
      `https://api.iamport.kr/payments/find/${order.orderNumber}/paid`,
    );
    assert.equal(options.headers.Authorization, 'Bearer portone-token');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: '0',
        response: {
          imp_uid: 'imp-123',
          merchant_uid: order.orderNumber,
          amount: 12500,
          status: 'paid',
          paid_at: 1795384800,
          pg_provider: 'html5_inicis',
        },
      }),
    };
  };

  try {
    const res = createResponse();
    await orderController.verifyPayment(
      {
        auth: { userId: String(userId) },
        body: { imp_uid: 'callback-imp-uid' },
        params: { orderNumber: order.orderNumber },
      },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.statusCode, null);
    assert.equal(res.body.paymentStatus, 'paid');
    assert.equal(order.payment.status, 'paid');
    assert.equal(order.payment.transactionId, 'imp-123');
    assert.equal(order.fulfillmentStatus, 'preparing');
    assert.equal(cartWasCleared, true);
  } finally {
    Order.findOne = originalFindOne;
    Cart.findOneAndDelete = originalCartDelete;
    global.fetch = originalFetch;
    restoreEnvironment();
  }
});

test('reports actionable guidance when PortOne rejects API credentials', async () => {
  const userId = new mongoose.Types.ObjectId();
  const order = {
    orderNumber: 'ORD-20261122-ABC12345',
    user: userId,
    payment: { method: 'card', status: 'pending', transactionId: '' },
  };
  const originalFindOne = Order.findOne;
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;
  const restoreEnvironment = setEnvironment({
    PORTONE_API_KEY: 'test-key',
    PORTONE_API_SECRET: 'test-secret',
  });
  Order.findOne = async () => order;
  global.fetch = async () => ({
    ok: false,
    status: 401,
    json: async () => ({
      code: -1,
      message: 'Invalid API Key',
      response: null,
    }),
  });
  console.error = () => {};

  try {
    const res = createResponse();
    await orderController.verifyPayment(
      {
        auth: { userId: String(userId) },
        body: { imp_uid: 'imp-123' },
        params: { orderNumber: order.orderNumber },
      },
      res,
      (error) => { res.error = error; },
    );

    assert.equal(res.error.status, 502);
    assert.match(res.error.message, /PortOne API 인증 실패/);
    assert.match(res.error.message, /HTTP 401, code -1/);
    assert.match(res.error.message, /PORTONE_API_KEY와 PORTONE_API_SECRET/);
    assert.doesNotMatch(res.error.message, /test-key|test-secret/);
  } finally {
    Order.findOne = originalFindOne;
    global.fetch = originalFetch;
    console.error = originalConsoleError;
    restoreEnvironment();
  }
});

test('falls back to the PortOne transaction ID when order-number lookup has no record', async () => {
  const userId = new mongoose.Types.ObjectId();
  const order = {
    orderNumber: 'ORD-20261122-ABC12345',
    user: userId,
    items: [],
    amounts: { totalAmount: 12500 },
    customerSnapshot: {},
    shippingAddress: {},
    payment: { method: 'card', status: 'pending', transactionId: '' },
    fulfillmentStatus: 'pending',
    statusHistory: { push() {} },
    save: async () => order,
  };
  const originalFindOne = Order.findOne;
  const originalCartDelete = Cart.findOneAndDelete;
  const originalFetch = global.fetch;
  const originalConsoleWarn = console.warn;
  const restoreEnvironment = setEnvironment({
    PORTONE_API_KEY: 'test-key',
    PORTONE_API_SECRET: 'test-secret',
  });
  let fetchCount = 0;
  let cartWasCleared = false;
  Order.findOne = async () => order;
  Cart.findOneAndDelete = async () => { cartWasCleared = true; };
  global.fetch = async (url) => {
    fetchCount += 1;
    if (fetchCount === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ code: 0, response: { access_token: 'portone-token' } }),
      };
    }
    if (fetchCount < 4) {
      return {
        ok: false,
        status: 404,
        json: async () => ({ code: -1, message: 'Not found', response: null }),
      };
    }

    assert.equal(url, 'https://api.iamport.kr/payments/callback-imp');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        response: {
          imp_uid: 'callback-imp',
          merchant_uid: order.orderNumber,
          amount: 12500,
          status: 'paid',
        },
      }),
    };
  };
  console.warn = () => {};

  try {
    const res = createResponse();
    await orderController.verifyPayment(
      {
        auth: { userId: String(userId) },
        body: { imp_uid: 'callback-imp' },
        params: { orderNumber: order.orderNumber },
      },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.body.paymentStatus, 'paid');
    assert.equal(order.payment.transactionId, 'callback-imp');
    assert.equal(cartWasCleared, true);
  } finally {
    Order.findOne = originalFindOne;
    Cart.findOneAndDelete = originalCartDelete;
    global.fetch = originalFetch;
    console.warn = originalConsoleWarn;
    restoreEnvironment();
  }
});

test('rejects a payment amount mismatch and keeps the cart', async () => {
  const userId = new mongoose.Types.ObjectId();
  const order = {
    orderNumber: 'ORD-20261122-ABC12345',
    user: userId,
    items: [],
    amounts: { totalAmount: 12500 },
    customerSnapshot: {},
    shippingAddress: {},
    payment: { method: 'card', status: 'pending', transactionId: '' },
    fulfillmentStatus: 'pending',
    statusHistory: { push() {} },
    save: async () => order,
  };
  const originalFindOne = Order.findOne;
  const originalCartDelete = Cart.findOneAndDelete;
  const originalFetch = global.fetch;
  const restoreEnvironment = setEnvironment({
    PORTONE_API_KEY: 'test-key',
    PORTONE_API_SECRET: 'test-secret',
  });
  let cartWasCleared = false;
  Order.findOne = async () => order;
  Cart.findOneAndDelete = async () => { cartWasCleared = true; };
  global.fetch = async (url) => ({
    ok: true,
    status: 200,
    json: async () => (url.endsWith('getToken')
      ? { code: '0', response: { access_token: 'portone-token' } }
      : {
        code: '0',
        response: {
          imp_uid: 'imp-123',
          merchant_uid: order.orderNumber,
          amount: 1,
          status: 'paid',
        },
      }),
  });

  try {
    const res = createResponse();
    await orderController.verifyPayment(
      {
        auth: { userId: String(userId) },
        body: { imp_uid: 'imp-123' },
        params: { orderNumber: order.orderNumber },
      },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.message, 'Payment does not match the order');
    assert.equal(cartWasCleared, false);
  } finally {
    Order.findOne = originalFindOne;
    Cart.findOneAndDelete = originalCartDelete;
    global.fetch = originalFetch;
    restoreEnvironment();
  }
});
