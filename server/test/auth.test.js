const assert = require('node:assert/strict');
const { after, test } = require('node:test');
const jwt = require('jsonwebtoken');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const User = require('../models/User');
const userController = require('../controllers/userController');
const {
  ACCESS_TOKEN_LIFETIME_SECONDS,
  authenticateToken,
  createAccessToken,
  getJwtSecret,
  requireAdmin,
  requireSelfOrAdmin,
} = require('../middleware/auth');

const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'test-secret-with-at-least-32-bytes';

after(() => {
  if (originalJwtSecret === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = originalJwtSecret;
  }
});

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

test('creates a short-lived access token containing user identity and role', () => {
  const token = createAccessToken({ _id: 'user-id', user_type: 'customer' });
  const claims = jwt.verify(token, process.env.JWT_SECRET);

  assert.equal(claims.sub, 'user-id');
  assert.equal(claims.user_type, 'customer');
  assert.equal(claims.exp - claims.iat, ACCESS_TOKEN_LIFETIME_SECONDS);
});

test('login returns a signed token and never includes the password', async () => {
  const originalFindOne = User.findOne;
  const user = {
    _id: 'user-id',
    user_type: 'customer',
    comparePassword: async () => true,
    toObject: () => ({
      _id: 'user-id',
      username: 'Test User',
      password: 'hashed-password',
      user_type: 'customer',
    }),
  };
  User.findOne = () => ({ select: async () => user });
  try {
    const res = createResponse();
    await userController.login(
      { body: { email: 'test@example.com', password: 'correct-password' } },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.statusCode, null);
    assert.equal(res.body.user.username, 'Test User');
    assert.equal(Object.hasOwn(res.body.user, 'password'), false);
    assert.equal(jwt.verify(res.body.token, process.env.JWT_SECRET).sub, 'user-id');
  } finally {
    User.findOne = originalFindOne;
  }
});

test('public registration always creates a customer account', async () => {
  const originalSave = User.prototype.save;
  User.prototype.save = async function () { return this; };
  try {
    const res = createResponse();
    await userController.createUser(
      {
        body: {
          email: 'test@example.com',
          username: 'Test',
          phone: '01012345678',
          password: 'password',
          address: 'Somewhere',
          user_type: 'admin',
        },
      },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.body.user_type, 'customer');
    assert.equal(res.body.phone, '01012345678');
    assert.equal(Object.hasOwn(res.body, 'password'), false);
    assert.equal(typeof res.body.token, 'string');
  } finally {
    User.prototype.save = originalSave;
  }
});

test('phone availability check detects an existing phone number', async () => {
  const originalFindOne = User.findOne;
  User.findOne = async (query) => {
    assert.deepEqual(query, { phone: '01012345678' });
    return { _id: 'existing-user' };
  };

  try {
    const res = createResponse();
    await userController.checkPhone(
      { params: { phone: '01012345678' } },
      res,
      (error) => { throw error; },
    );

    assert.deepEqual(res.body, { exists: true });
  } finally {
    User.findOne = originalFindOne;
  }
});

test('current-user endpoint returns the profile for the authenticated token identity', async () => {
  const originalFindById = User.findById;
  const user = {
    toObject: () => ({
      _id: 'user-id',
      username: 'Account Name',
      nickname: 'Shopper',
      password: 'hashed-password',
    }),
  };
  User.findById = async (id) => {
    assert.equal(id, 'user-id');
    return user;
  };

  try {
    const res = createResponse();
    await userController.getCurrentUser({ auth: { userId: 'user-id' } }, res, (error) => {
      throw error;
    });

    assert.equal(res.body.username, 'Account Name');
    assert.equal(res.body.nickname, 'Shopper');
    assert.equal(Object.hasOwn(res.body, 'password'), false);
  } finally {
    User.findById = originalFindById;
  }
});

test('password change requires the current password and saves a validated replacement', async () => {
  const originalFindById = User.findById;
  const user = {
    _id: 'user-id',
    password: 'old-hash',
    comparePassword: async (password) => password === 'Current123!',
    save: async function () {
      this.saved = true;
    },
  };
  User.findById = (id) => {
    assert.equal(id, 'user-id');
    return { select: async (fields) => {
      assert.equal(fields, '+password');
      return user;
    } };
  };

  try {
    const res = createResponse();
    await userController.changePassword(
      {
        auth: { userId: 'user-id' },
        body: { currentPassword: 'Current123!', newPassword: 'NewPassword123!' },
      },
      res,
      (error) => { throw error; },
    );

    assert.equal(user.password, 'NewPassword123!');
    assert.equal(user.saved, true);
    assert.equal(res.body.message, '비밀번호가 변경되었습니다.');
  } finally {
    User.findById = originalFindById;
  }
});

test('account withdrawal anonymizes historical orders and removes the cart', async () => {
  const originalFindById = User.findById;
  const originalDeleteOne = User.deleteOne;
  const originalOrderFindOne = Order.findOne;
  const originalOrderUpdateMany = Order.updateMany;
  const originalCartFindOneAndDelete = Cart.findOneAndDelete;
  const userId = '507f1f77bcf86cd799439011';
  const user = {
    _id: userId,
    comparePassword: async (password) => password === 'Current123!',
  };
  let orderUpdate;
  const historyUpdates = [];
  let cartRemoved = false;
  User.findById = () => ({ select: async () => user });
  User.deleteOne = async (filter) => {
    assert.equal(String(filter._id), userId);
    return { deletedCount: 1 };
  };
  Order.findOne = async (filter) => {
    assert.equal(filter.user, userId);
    assert.deepEqual(filter.fulfillmentStatus, { $nin: ['delivered', 'cancelled'] });
    return null;
  };
  Order.updateMany = async (...args) => {
    historyUpdates.push(args);
    if (args[0].user) orderUpdate = args;
  };
  Cart.findOneAndDelete = async (filter) => {
    assert.equal(filter.user, userId);
    cartRemoved = true;
  };

  try {
    const res = createResponse();
    await userController.withdrawCurrentUser(
      { auth: { userId }, body: { password: 'Current123!' } },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.statusCode, null);
    assert.equal(orderUpdate[0].user, userId);
    assert.equal(orderUpdate[1].$set['customerSnapshot.name'], '탈퇴한 회원');
    assert.match(orderUpdate[1].$set['customerSnapshot.email'], /^withdrawn-.+@example\.invalid$/);
    assert.equal(orderUpdate[1].$set['shippingAddress.phone'], '00000000000');
    assert.equal(orderUpdate[1].$set['payment.virtualAccount.accountNumber'], '');
    assert.equal(orderUpdate[1].$set['shipping.trackingNumber'], '');
    assert.equal(orderUpdate[1].$set['statusHistory.$[].note'], '');
    assert.deepEqual(historyUpdates[0][2].arrayFilters, [{ 'history.changedBy': userId }]);
    assert.deepEqual(historyUpdates[0][1].$set, { 'statusHistory.$[history].changedBy': null });
    assert.equal(cartRemoved, true);
    assert.match(res.body.message, /개인정보를 익명화/);
  } finally {
    User.findById = originalFindById;
    User.deleteOne = originalDeleteOne;
    Order.findOne = originalOrderFindOne;
    Order.updateMany = originalOrderUpdateMany;
    Cart.findOneAndDelete = originalCartFindOneAndDelete;
  }
});

test('generic profile updates cannot change the account email or password', async () => {
  const res = createResponse();
  await userController.updateUser(
    {
      params: { id: '507f1f77bcf86cd799439011' },
      body: { email: 'new@example.com', password: 'NewPassword123!' },
    },
    res,
    (error) => { throw error; },
  );

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'No editable profile fields provided');
});

test('administrator account deletion cannot bypass password confirmation with uppercase IDs', async () => {
  const res = createResponse();
  await userController.deleteUser(
    {
      params: { id: '507F1F77BCF86CD799439011' },
      auth: { userId: '507f1f77bcf86cd799439011' },
    },
    res,
    (error) => { throw error; },
  );

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /현재 비밀번호/);
});

test('account withdrawal is blocked while an order is active', async () => {
  const originalFindById = User.findById;
  const originalDeleteOne = User.deleteOne;
  const originalOrderFindOne = Order.findOne;
  const originalOrderUpdateMany = Order.updateMany;
  const originalCartFindOneAndDelete = Cart.findOneAndDelete;
  let mutationAttempted = false;
  User.findById = () => ({
    select: async () => ({
      _id: 'user-id',
      comparePassword: async () => true,
    }),
  });
  User.deleteOne = async () => { mutationAttempted = true; };
  Order.findOne = async () => ({ fulfillmentStatus: 'shipped' });
  Order.updateMany = async () => { mutationAttempted = true; };
  Cart.findOneAndDelete = async () => { mutationAttempted = true; };

  try {
    const res = createResponse();
    await userController.withdrawCurrentUser(
      { auth: { userId: 'user-id' }, body: { password: 'Current123!' } },
      res,
      (error) => { throw error; },
    );

    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /배송 중인 주문/);
    assert.equal(mutationAttempted, false);
  } finally {
    User.findById = originalFindById;
    User.deleteOne = originalDeleteOne;
    Order.findOne = originalOrderFindOne;
    Order.updateMany = originalOrderUpdateMany;
    Cart.findOneAndDelete = originalCartFindOneAndDelete;
  }
});

test('rejects missing and expired bearer tokens', () => {
  const missingResponse = createResponse();
  let nextCalled = false;
  authenticateToken(
    { get: () => undefined },
    missingResponse,
    () => { nextCalled = true; },
  );
  assert.equal(missingResponse.statusCode, 401);
  assert.equal(nextCalled, false);

  const expiredToken = jwt.sign(
    { user_type: 'customer' },
    process.env.JWT_SECRET,
    { subject: 'user-id', expiresIn: -1 },
  );
  const expiredResponse = createResponse();
  authenticateToken(
    { get: () => `Bearer ${expiredToken}` },
    expiredResponse,
    () => { nextCalled = true; },
  );
  assert.equal(expiredResponse.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('authenticates valid bearer tokens and assigns identity to the request', () => {
  const token = createAccessToken({ _id: 'user-id', user_type: 'customer' });
  const req = { get: () => `Bearer ${token}` };
  const res = createResponse();
  let nextCalled = false;

  authenticateToken(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.deepEqual(req.auth, { userId: 'user-id', userType: 'customer' });
});

test('allows only admins to list users and owners or admins to access one user', () => {
  const deniedResponse = createResponse();
  requireAdmin({ auth: { userType: 'customer' } }, deniedResponse, () => {});
  assert.equal(deniedResponse.statusCode, 403);

  let nextCalled = false;
  requireSelfOrAdmin(
    { auth: { userId: 'owner-id', userType: 'customer' }, params: { id: 'owner-id' } },
    createResponse(),
    () => { nextCalled = true; },
  );
  assert.equal(nextCalled, true);

  const forbiddenResponse = createResponse();
  requireSelfOrAdmin(
    { auth: { userId: 'owner-id', userType: 'customer' }, params: { id: 'other-id' } },
    forbiddenResponse,
    () => {},
  );
  assert.equal(forbiddenResponse.statusCode, 403);
});

test('requires a JWT secret with at least 32 bytes', () => {
  const validSecret = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  assert.throws(getJwtSecret, /JWT_SECRET must be set/);
  process.env.JWT_SECRET = 'too-short';
  assert.throws(getJwtSecret, /JWT_SECRET must be set/);
  process.env.JWT_SECRET = validSecret;
});
