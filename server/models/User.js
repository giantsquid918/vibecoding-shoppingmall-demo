const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const usernamePattern = /^\p{L}+$/u;

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^\S+@\S+\.\S+$/,
    },
    username: {
      type: String,
      required: true,
      match: [
        usernamePattern,
        '이름에는 문자만 입력할 수 있습니다.',
      ],
    },
    nickname: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^01[0-9]\d{7,8}$/, '올바른 휴대폰 번호를 입력해 주세요.'],
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    user_type: {
      type: String,
      required: true,
      enum: ['customer', 'admin'],
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;

  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
