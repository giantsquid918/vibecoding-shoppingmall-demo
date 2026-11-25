const Cart = require('../models/Cart');
const Order = require('../models/Order');
const User = require('../models/User');

const portOneApiBaseUrl = 'https://api.iamport.kr';

function getPortOneCredentials() {
  const apiKey = process.env.PORTONE_API_KEY;
  const apiSecret = process.env.PORTONE_API_SECRET;
  return apiKey && apiSecret ? { apiKey, apiSecret } : null;
}

function hasValidBody(req, res) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ message: 'Request body must be a JSON object' });
    return false;
  }

  return true;
}

function getPortOneError(operation, response, result) {
  const code = result?.code === undefined || result?.code === null
    ? 'unknown'
    : String(result.code);
  const detail = typeof result?.message === 'string' ? result.message : '';
  const authenticationFailed = operation === 'authentication';
  const paymentNotFound = operation.startsWith('payment lookup')
    && response?.status === 404
    && Number(result?.code) === -1;
  const guidance = authenticationFailed
    ? 'server/.env의 PORTONE_API_KEY와 PORTONE_API_SECRET이 올바른 REST API 자격 증명인지 확인하고 서버를 재시작하세요.'
    : 'PortOne 결제 내역과 결제 ID를 확인하세요.';
  const error = new Error(
    `${authenticationFailed ? 'PortOne API 인증' : 'PortOne 결제 조회'} 실패 `
      + `(HTTP ${response?.status || 'unknown'}, code ${code}). ${guidance}`,
  );
  error.status = 502;
  error.portOneNotFound = paymentNotFound;
  const log = paymentNotFound ? console.warn : console.error;
  log(`[PortOne] ${operation} request failed`, {
    httpStatus: response?.status || null,
    code,
    message: detail || 'No provider message',
  });
  return error;
}

async function requestPortOneResponse(url, options, operation, isValidResponse) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    const connectionError = new Error(
      `PortOne ${operation === 'authentication' ? '인증' : '결제 조회'} 서버에 연결할 수 없습니다. `
        + '서버 네트워크 연결을 확인하세요.',
    );
    connectionError.status = 502;
    console.error(`[PortOne] ${operation} connection failed`, error.message);
    throw connectionError;
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw getPortOneError(operation, response, null);
  }

  const hasSuccessCode = result?.code !== undefined
    && result?.code !== null
    && Number(result.code) === 0;
  if (!response.ok || !hasSuccessCode || !isValidResponse(result?.response)) {
    throw getPortOneError(operation, response, result);
  }

  return result.response;
}

async function getPortOneAccessToken(credentials) {
  const result = await requestPortOneResponse(
    `${portOneApiBaseUrl}/users/getToken`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imp_key: credentials.apiKey,
        imp_secret: credentials.apiSecret,
      }),
    },
    'authentication',
    (data) => Boolean(data?.access_token),
  );

  return result.access_token;
}

async function getPortOnePayment(accessToken, impUid) {
  return requestPortOneResponse(
    `${portOneApiBaseUrl}/payments/${encodeURIComponent(impUid)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    'payment lookup by transaction ID',
    Boolean,
  );
}

async function getPortOnePaymentByOrderNumber(accessToken, orderNumber, status) {
  try {
    return await requestPortOneResponse(
      `${portOneApiBaseUrl}/payments/find/${encodeURIComponent(orderNumber)}/${status}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      'payment lookup by order number',
      Boolean,
    );
  } catch (error) {
    if (error.portOneNotFound) return null;
    throw error;
  }
}

async function getPortOnePaymentForOrder(accessToken, order, impUid) {
  const paymentByOrderNumber =
    await getPortOnePaymentByOrderNumber(accessToken, order.orderNumber, 'paid')
    || await getPortOnePaymentByOrderNumber(accessToken, order.orderNumber, 'ready');
  if (paymentByOrderNumber || !impUid) return paymentByOrderNumber;

  try {
    return await getPortOnePayment(accessToken, impUid);
  } catch (error) {
    if (error.portOneNotFound) return null;
    throw error;
  }
}

function cartItemKey(item) {
  const productId = item.product?.productId || item.productId || '';
  return `${productId}:${Number(item.unitPrice)}:${Number(item.quantity)}`;
}

function orderMatchesCart(order, cart) {
  if (!Array.isArray(order.items) || order.items.length !== cart.items.length) return false;

  const orderItems = order.items.map(cartItemKey).sort();
  const cartItems = cart.items.map(cartItemKey).sort();
  return orderItems.every((item, index) => item === cartItems[index]);
}

async function findPendingOrders(userId) {
  return Order.find({
    user: userId,
    'payment.status': 'pending',
  }).sort({ createdAt: -1 });
}

async function deletePendingOrder(order, userId) {
  const result = await Order.deleteOne({
    _id: order._id,
    user: userId,
    'payment.status': 'pending',
    'payment.transactionId': order.payment.transactionId || '',
  });
  return result.deletedCount === 1;
}

async function reconcilePortOnePayment(order, userId, payment) {
  if (!payment) return 'not_found';
  if (
    typeof payment.imp_uid !== 'string'
    || payment.merchant_uid !== order.orderNumber
    || Number(payment.amount) !== order.amounts.totalAmount
  ) {
    return 'mismatch';
  }

  if (payment.status === 'ready') {
    order.payment.transactionId = payment.imp_uid;
    order.payment.provider = payment.pg_provider || 'PortOne';
    order.payment.virtualAccount = {
      bankName: payment.vbank_name || '',
      accountNumber: payment.vbank_num || '',
      holder: payment.vbank_holder || '',
      expiresAt: payment.vbank_date ? new Date(payment.vbank_date * 1000) : null,
    };
    await order.save();
    return 'pending';
  }

  if (payment.status === 'paid') {
    order.payment.status = 'paid';
    order.payment.transactionId = payment.imp_uid;
    order.payment.provider = payment.pg_provider || 'PortOne';
    order.payment.paidAt = payment.paid_at
      ? new Date(payment.paid_at * 1000)
      : new Date();
    order.fulfillmentStatus = 'preparing';
    order.statusHistory.push({
      status: 'preparing',
      changedBy: userId,
      note: '결제 확인',
    });
    await order.save();
    await Cart.findOneAndDelete({ user: userId });
    return 'paid';
  }

  if (payment.status === 'failed' || payment.status === 'cancelled') {
    return await deletePendingOrder(order, userId) ? payment.status : 'unresolved';
  }

  return 'unresolved';
}

function serializeOrder(order) {
  return {
    orderNumber: order.orderNumber,
    items: order.items,
    amounts: order.amounts,
    customerSnapshot: order.customerSnapshot,
    shippingAddress: order.shippingAddress,
    payment: order.payment,
    fulfillmentStatus: order.fulfillmentStatus,
    shipping: order.shipping,
    statusHistory: order.statusHistory,
    createdAt: order.createdAt,
  };
}

async function listAdminOrders(req, res, next) {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json({ orders: orders.map(serializeOrder) });
  } catch (error) {
    next(error);
  }
}

async function listOrders(req, res, next) {
  try {
    const orders = await Order.find({ user: req.auth.userId }).sort({ createdAt: -1 });
    res.json({ orders: orders.map(serializeOrder) });
  } catch (error) {
    next(error);
  }
}

async function updateOrderStatus(req, res, next) {
  if (!hasValidBody(req, res)) return;

  const { fulfillmentStatus } = req.body;
  const allowedStatuses = Order.schema.path('fulfillmentStatus').enumValues;
  if (!allowedStatuses.includes(fulfillmentStatus) || fulfillmentStatus === 'pending') {
    return res.status(400).json({ message: 'Invalid fulfillment status' });
  }

  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const transitions = {
      pending: ['preparing', 'shipped', 'cancelled'],
      preparing: ['shipped', 'cancelled'],
      shipped: ['delivered', 'cancelled'],
      delivered: [],
      cancelled: [],
    };
    if (!transitions[order.fulfillmentStatus]?.includes(fulfillmentStatus)) {
      return res.status(409).json({
        message: `Cannot change order status from ${order.fulfillmentStatus} to ${fulfillmentStatus}`,
      });
    }
    if (
      ['preparing', 'shipped', 'delivered'].includes(fulfillmentStatus)
      && order.payment.status !== 'paid'
    ) {
      return res.status(409).json({ message: 'Only paid orders can be prepared or shipped' });
    }
    if (
      fulfillmentStatus === 'shipped'
      && (!order.shipping.carrier || !order.shipping.trackingNumber)
    ) {
      return res.status(409).json({
        message: 'Carrier and tracking number must be saved before shipping',
      });
    }
    if (
      fulfillmentStatus === 'cancelled'
      && order.payment.status === 'pending'
      && order.payment.transactionId
    ) {
      return res.status(409).json({
        message: 'PortOne에서 대기 중인 결제를 먼저 취소해야 합니다.',
      });
    }

    const changedAt = new Date();
    if (fulfillmentStatus === 'shipped') {
      order.shipping.shippedAt = changedAt;
    }
    if (fulfillmentStatus === 'delivered') {
      order.shipping.deliveredAt = changedAt;
    }
    if (fulfillmentStatus === 'cancelled' && order.payment.status === 'pending') {
      order.payment.status = 'cancelled';
    }
    order.fulfillmentStatus = fulfillmentStatus;
    order.statusHistory.push({
      status: fulfillmentStatus,
      changedAt,
      changedBy: req.auth.userId,
      note: fulfillmentStatus === 'cancelled'
        ? '관리자 주문 취소'
        : '관리자 주문 상태 변경',
    });
    await order.save();

    res.json({
      order: serializeOrder(order),
      refundRequired: fulfillmentStatus === 'cancelled' && order.payment.status === 'paid',
    });
  } catch (error) {
    next(error);
  }
}

async function updateOrderShipping(req, res, next) {
  if (!hasValidBody(req, res)) return;

  const carrier = typeof req.body.carrier === 'string' ? req.body.carrier.trim() : '';
  const trackingNumber =
    typeof req.body.trackingNumber === 'string' ? req.body.trackingNumber.trim() : '';
  if (!carrier || !trackingNumber || carrier.length > 80 || trackingNumber.length > 100) {
    return res.status(400).json({
      message: 'Carrier and tracking number are required and must be within their length limits',
    });
  }

  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.payment.status !== 'paid') {
      return res.status(409).json({ message: 'Only paid orders can be shipped' });
    }
    if (!['preparing', 'shipped'].includes(order.fulfillmentStatus)) {
      return res.status(409).json({ message: 'This order cannot be updated for shipping' });
    }

    const isStartingShipment = order.fulfillmentStatus === 'preparing';
    order.shipping.carrier = carrier;
    order.shipping.trackingNumber = trackingNumber;
    if (isStartingShipment) {
      const shippedAt = new Date();
      order.shipping.shippedAt = shippedAt;
      order.fulfillmentStatus = 'shipped';
      order.statusHistory.push({
        status: 'shipped',
        changedAt: shippedAt,
        changedBy: req.auth.userId,
        note: `배송 시작 (${carrier}, ${trackingNumber})`,
      });
    }
    await order.save();

    res.json({ order: serializeOrder(order) });
  } catch (error) {
    next(error);
  }
}

async function preflightOrder(req, res, next) {
  if (!hasValidBody(req, res)) return;

  const credentials = getPortOneCredentials();
  if (!credentials) {
    return res.status(503).json({
      message: '서버에 PORTONE_API_KEY와 PORTONE_API_SECRET 설정이 필요합니다.',
    });
  }

  try {
    const cart = await Cart.findOne({ user: req.auth.userId }).populate('items.product');
    if (!cart?.items.length) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    const pendingOrders = await findPendingOrders(req.auth.userId);
    const duplicateOrder = pendingOrders.find((order) => orderMatchesCart(order, cart));
    if (!duplicateOrder) return res.json({ action: 'create' });

    const accessToken = await getPortOneAccessToken(credentials);
    const payment = await getPortOnePaymentForOrder(
      accessToken,
      duplicateOrder,
      duplicateOrder.payment.transactionId,
    );
    const paymentStatus = await reconcilePortOnePayment(
      duplicateOrder,
      req.auth.userId,
      payment,
    );

    if (paymentStatus === 'paid') {
      return res.json({
        action: 'paid',
        order: serializeOrder(duplicateOrder),
      });
    }
    if (paymentStatus === 'pending') {
      return res.json({
        action: 'pending',
        order: serializeOrder(duplicateOrder),
      });
    }
    if (paymentStatus === 'failed' || paymentStatus === 'cancelled') {
      return res.json({ action: 'create' });
    }
    if (paymentStatus === 'not_found') {
      if (await deletePendingOrder(duplicateOrder, req.auth.userId)) {
        return res.json({ action: 'create' });
      }

      return res.status(409).json({
        message: '기존 주문의 상태가 변경 중입니다. 잠시 후 다시 시도해 주세요.',
        orderNumber: duplicateOrder.orderNumber,
      });
    }

    return res.status(409).json({
      message: paymentStatus === 'mismatch'
        ? '기존 주문의 결제 정보가 일치하지 않아 새 결제를 막았습니다. 주문번호를 확인해 주세요.'
        : '기존 주문의 결제 상태를 확인할 수 없어 중복 결제를 막았습니다. 기존 주문을 확인해 주세요.',
      orderNumber: duplicateOrder.orderNumber,
    });
  } catch (error) {
    next(error);
  }
}

async function createOrder(req, res, next) {
  if (!hasValidBody(req, res)) return;

  const credentials = getPortOneCredentials();
  if (!credentials) {
    return res.status(503).json({
      message: '서버에 PORTONE_API_KEY와 PORTONE_API_SECRET 설정이 필요합니다.',
    });
  }

  const { checkoutKey, paymentMethod, shippingAddress } = req.body;
  if (typeof checkoutKey !== 'string' || !checkoutKey.trim()) {
    return res.status(400).json({ message: 'Checkout key is required' });
  }
  if (!shippingAddress || typeof shippingAddress !== 'object' || Array.isArray(shippingAddress)) {
    return res.status(400).json({ message: 'Shipping address is required' });
  }
  if (!Order.schema.path('payment.method').enumValues.includes(paymentMethod)) {
    return res.status(400).json({ message: 'Invalid payment method' });
  }

  try {
    const existingOrder = await Order.findOne({
      user: req.auth.userId,
      checkoutKey: checkoutKey.trim(),
    });
    if (existingOrder) {
      if (existingOrder.payment.status !== 'pending') {
        return res.status(409).json({ message: 'This checkout has already been completed' });
      }

      return res.status(409).json({
        message: '기존 주문의 결제 상태를 먼저 확인해 주세요.',
        orderNumber: existingOrder.orderNumber,
      });
    }

    const [cart, user] = await Promise.all([
      Cart.findOne({ user: req.auth.userId }).populate('items.product'),
      User.findById(req.auth.userId),
    ]);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!cart?.items.length) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    const items = [];
    for (const item of cart.items) {
      const product = item.product;
      if (!product) {
        return res.status(409).json({
          message: 'A product in the cart is no longer available',
        });
      }

      items.push({
        product: product._id,
        productId: product.productId,
        name: product.name,
        image: product.image,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      });
    }

    const pendingOrders = await findPendingOrders(req.auth.userId);
    const duplicateOrder = pendingOrders.find((candidate) => (
      orderMatchesCart(candidate, cart)
    ));
    if (duplicateOrder) {
      return res.status(409).json({
        message: '동일한 상품의 미완료 주문이 있어 새 주문을 만들 수 없습니다.',
        orderNumber: duplicateOrder.orderNumber,
      });
    }

    const order = new Order({
      checkoutKey: checkoutKey.trim(),
      user: req.auth.userId,
      customerSnapshot: {
        name: user.username,
        email: user.email,
      },
      items,
      shippingAddress: {
        recipientName: shippingAddress.recipientName,
        phone: user.phone,
        postalCode: shippingAddress.postalCode,
        address1: shippingAddress.address1,
        address2: shippingAddress.address2,
        deliveryNote: shippingAddress.deliveryNote,
      },
      payment: { method: paymentMethod },
      statusHistory: [{ status: 'pending', note: '결제 대기' }],
    });

    await order.save();
    res.status(201).json(serializeOrder(order));
  } catch (error) {
    next(error);
  }
}

async function verifyPayment(req, res, next) {
  const credentials = getPortOneCredentials();
  if (!credentials) {
    return res.status(503).json({
      message: '서버에 PORTONE_API_KEY와 PORTONE_API_SECRET 설정이 필요합니다.',
    });
  }

  const impUid = typeof req.body?.imp_uid === 'string' ? req.body.imp_uid.trim() : '';
  if (!impUid) {
    return res.status(400).json({ message: 'PortOne payment ID is required' });
  }

  try {
    const order = await Order.findOne({
      orderNumber: req.params.orderNumber,
      user: req.auth.userId,
    });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.payment.status === 'paid') {
      return res.json({ order: serializeOrder(order), paymentStatus: 'paid' });
    }

    if (order.payment.status !== 'pending') {
      return res.status(409).json({ message: 'Order is not awaiting payment' });
    }

    const accessToken = await getPortOneAccessToken(credentials);
    const payment = await getPortOnePaymentForOrder(accessToken, order, impUid);
    const paymentStatus = await reconcilePortOnePayment(order, req.auth.userId, payment);
    if (paymentStatus === 'not_found') {
      return res.status(404).json({ message: 'PortOne payment was not found for this order' });
    }
    if (paymentStatus === 'mismatch') {
      return res.status(409).json({ message: 'Payment does not match the order' });
    }
    if (paymentStatus === 'pending') {
      return res.status(202).json({
        order: serializeOrder(order),
        paymentStatus: 'pending',
      });
    }
    if (paymentStatus === 'failed' || paymentStatus === 'cancelled') {
      return res.status(402).json({ message: '결제가 완료되지 않았습니다.' });
    }
    if (paymentStatus === 'paid') {
      return res.json({ order: serializeOrder(order), paymentStatus: 'paid' });
    }
    return res.status(409).json({ message: 'Payment status could not be resolved' });
  } catch (error) {
    next(error);
  }
}

async function cancelOrder(req, res, next) {
  try {
    const order = await Order.findOne({
      orderNumber: req.params.orderNumber,
      user: req.auth.userId,
    });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.payment.status !== 'pending' || order.payment.transactionId) {
      return res.status(409).json({ message: 'This order cannot be cancelled' });
    }

    if (!await deletePendingOrder(order, req.auth.userId)) {
      return res.status(409).json({ message: 'Order status changed before cancellation' });
    }
    res.json({ orderNumber: order.orderNumber, paymentStatus: 'cancelled' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  cancelOrder,
  createOrder,
  listAdminOrders,
  listOrders,
  preflightOrder,
  updateOrderShipping,
  updateOrderStatus,
  verifyPayment,
};
