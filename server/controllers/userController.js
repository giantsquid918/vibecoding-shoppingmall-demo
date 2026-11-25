const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const User = require('../models/User');
const { createAccessToken } = require('../middleware/auth');

// 회원가입에서만 허용하는 사용자 필드입니다.
const userFields = ['email', 'username', 'nickname', 'phone', 'password', 'address'];
const profileFields = ['username', 'nickname', 'phone', 'address'];
const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

// 잘못된 ID로 데이터베이스를 조회하기 전에 MongoDB ObjectId 형식인지 확인합니다.
function isValidObjectId(id) {
  return mongoose.isObjectIdOrHexString(id);
}

// 요청 본문이 필드 객체인지 확인해 잘못된 JSON 입력을 거릅니다.
function hasValidBody(req, res) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ message: 'Request body must be a JSON object' });
    return false;
  }

  return true;
}

// 허용 목록에 포함된 필드만 골라 임의 필드 변경을 방지합니다.
function pickUserFields(body, fields = userFields) {
  return Object.fromEntries(
    fields
      .filter((field) => Object.hasOwn(body, field))
      .map((field) => [field, body[field]]),
  );
}

async function removeAccountData(userId) {
  const activeOrder = await Order.findOne({
    user: userId,
    fulfillmentStatus: { $nin: ['delivered', 'cancelled'] },
  });
  if (activeOrder) return { activeOrder };

  await Order.updateMany(
    { 'statusHistory.changedBy': userId },
    { $set: { 'statusHistory.$[history].changedBy': null } },
    { arrayFilters: [{ 'history.changedBy': userId }] },
  );

  const anonymizedUserId = new mongoose.Types.ObjectId();
  const anonymizedEmail = `withdrawn-${crypto.randomUUID()}@example.invalid`;
  await Order.updateMany(
    { user: userId },
    {
      $set: {
        user: anonymizedUserId,
        'customerSnapshot.name': '탈퇴한 회원',
        'customerSnapshot.email': anonymizedEmail,
        'shippingAddress.recipientName': '탈퇴한 회원',
        'shippingAddress.phone': '00000000000',
        'shippingAddress.postalCode': '00000',
        'shippingAddress.address1': '삭제된 주소',
        'shippingAddress.address2': '',
        'shippingAddress.deliveryNote': '',
        'payment.virtualAccount.holder': '탈퇴한 회원',
        'payment.virtualAccount.accountNumber': '',
        'shipping.trackingNumber': '',
        'statusHistory.$[].note': '',
      },
    },
  );
  await Cart.findOneAndDelete({ user: userId });

  const deletion = await User.deleteOne({ _id: userId });
  return { deleted: deletion.deletedCount === 1 };
}

// Mongoose 문서를 응답용 객체로 바꾸고 비밀번호를 응답에서 제거합니다.
function serializeUser(user) {
  const userData = user.toObject();
  delete userData.password;
  return userData;
}

// 사용자 정보를 검증하고 저장한 뒤 생성된 정보를 반환합니다.
async function createUser(req, res, next) {
  if (!hasValidBody(req, res)) return;

  try {
    const user = new User({
      ...pickUserFields(req.body),
      user_type: 'customer',
    });
    await user.save();
    res.status(201).json({
      ...serializeUser(user),
      token: createAccessToken(user),
    });
  } catch (error) {
    next(error);
  }
}

async function checkPhone(req, res, next) {
  const phone = String(req.params.phone || '').replace(/\D/g, '');
  if (!/^01[0-9]\d{7,8}$/.test(phone)) {
    return res.status(400).json({ message: '올바른 휴대폰 번호를 입력해 주세요.' });
  }

  try {
    const user = await User.findOne({ phone });
    res.json({ exists: Boolean(user) });
  } catch (error) {
    next(error);
  }
}

// 이메일과 비밀번호를 확인하고 비밀번호를 제외한 사용자 정보를 반환합니다.
async function login(req, res, next) {
  if (!hasValidBody(req, res)) return;

  const { email, password } = req.body;
  if (
    typeof email !== 'string' ||
    !/^\S+@\S+\.\S+$/.test(email.trim()) ||
    typeof password !== 'string' ||
    password.length === 0
  ) {
    return res.status(400).json({ message: '이메일과 비밀번호를 확인해 주세요.' });
  }

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }

    res.json({
      message: '로그인되었습니다.',
      token: createAccessToken(user),
      user: serializeUser(user),
    });
  } catch (error) {
    next(error);
  }
}

// 비밀번호를 제외한 사용자 목록을 최신 생성 순으로 반환합니다.
async function getUsers(req, res, next) {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users.map(serializeUser));
  } catch (error) {
    next(error);
  }
}

// 토큰에 포함된 사용자 ID로 현재 로그인한 사용자를 반환합니다.
async function getCurrentUser(req, res, next) {
  try {
    const user = await User.findById(req.auth.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(serializeUser(user));
  } catch (error) {
    next(error);
  }
}

// ID로 사용자를 조회하고, ID가 잘못됐거나 사용자가 없으면 오류를 반환합니다.
async function getUser(req, res, next) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid user ID' });
  }

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json(serializeUser(user));
  } catch (error) {
    next(error);
  }
}

// 전달된 사용자 필드만 수정하고 save 미들웨어를 포함해 저장합니다.
async function updateUser(req, res, next) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid user ID' });
  }
  if (!hasValidBody(req, res)) return;

  try {
    const updates = pickUserFields(req.body, profileFields);
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No editable profile fields provided' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    Object.assign(user, updates);
    await user.save();
    res.json(serializeUser(user));
  } catch (error) {
    next(error);
  }
}

async function changePassword(req, res, next) {
  if (!hasValidBody(req, res)) return;

  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== 'string' || !currentPassword) {
    return res.status(400).json({ message: '현재 비밀번호를 입력해 주세요.' });
  }
  if (typeof newPassword !== 'string' || !passwordPattern.test(newPassword)) {
    return res.status(400).json({
      message: '새 비밀번호는 8자 이상이며 영문, 숫자, 특수문자를 포함해야 합니다.',
    });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ message: '새 비밀번호는 현재 비밀번호와 달라야 합니다.' });
  }

  try {
    const user = await User.findById(req.auth.userId).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!(await user.comparePassword(currentPassword))) {
      return res.status(400).json({ message: '현재 비밀번호가 올바르지 않습니다.' });
    }

    user.password = newPassword;
    await user.save();
    res.json({ message: '비밀번호가 변경되었습니다.' });
  } catch (error) {
    next(error);
  }
}

async function withdrawCurrentUser(req, res, next) {
  if (!hasValidBody(req, res)) return;

  const { password } = req.body;
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ message: '탈퇴를 확인하려면 비밀번호를 입력해 주세요.' });
  }

  try {
    const user = await User.findById(req.auth.userId).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!(await user.comparePassword(password))) {
      return res.status(400).json({ message: '비밀번호가 올바르지 않습니다.' });
    }

    const result = await removeAccountData(user._id);
    if (result.activeOrder) {
      return res.status(409).json({
        message: '처리 중이거나 배송 중인 주문이 있습니다. 주문이 완료되거나 취소된 뒤 탈퇴할 수 있습니다.',
      });
    }
    if (!result.deleted) return res.status(404).json({ message: 'User not found' });

    res.json({
      message: '회원 탈퇴가 완료되었습니다. 주문 기록은 개인정보를 익명화하여 보관합니다.',
    });
  } catch (error) {
    next(error);
  }
}

// 관리자 사용자 삭제도 주문 개인정보를 익명화하고 활성 주문을 보호합니다.
async function deleteUser(req, res, next) {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid user ID' });
  }
  if (req.params.id.toLowerCase() === req.auth.userId.toLowerCase()) {
    return res.status(409).json({
      message: '본인 계정은 현재 비밀번호를 확인하는 회원 탈퇴 기능을 이용해 주세요.',
    });
  }

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const result = await removeAccountData(user._id);
    if (result.activeOrder) {
      return res.status(409).json({
        message: '사용자에게 처리 중이거나 배송 중인 주문이 있어 삭제할 수 없습니다.',
      });
    }
    if (!result.deleted) return res.status(404).json({ message: 'User not found' });

    res.json({ message: 'User deleted; historical order personal data was anonymized' });
  } catch (error) {
    next(error);
  }
}

// Express 라우터가 연결할 수 있도록 CRUD 컨트롤러를 내보냅니다.
module.exports = {
  changePassword,
  createUser,
  checkPhone,
  login,
  getUsers,
  getCurrentUser,
  getUser,
  updateUser,
  deleteUser,
  withdrawCurrentUser,
};
