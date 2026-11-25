require('dotenv').config({ path: require('node:path').join(__dirname, '.env') });

const express = require('express');
const mongoose = require('mongoose');
const path = require('node:path');
const adminRoutes = require('./routes/adminRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const productRoutes = require('./routes/productRoutes');
const userRoutes = require('./routes/userRoutes');
const { getJwtSecret } = require('./middleware/auth');

const app = express();
const port = process.env.PORT || 5000;
function resolveMongoUri(env = process.env) {
  const atlasUri = env.MONGODB_ATLAS_URL?.trim();
  return atlasUri || 'mongodb://127.0.0.1:27017/shoppingmall';
}

const mongoUri = resolveMongoUri();

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error.name === 'ValidationError' || error.name === 'CastError') {
    return res.status(400).json({ message: error.message });
  }
  if (error.code === 11000) {
    const duplicateField = Object.keys(error.keyPattern || {})[0];
    const message = duplicateField === 'productId'
      ? 'A product with this product ID already exists'
      : duplicateField === 'email'
        ? 'A user with this email already exists'
        : duplicateField === 'phone'
          ? '휴대폰 번호가 이미 등록되어 있습니다'
          : 'A resource with this value already exists';
    return res.status(409).json({ message });
  }
  if (error.status === 400) {
    return res.status(400).json({ message: error.message });
  }
  if (error.status === 502) {
    return res.status(502).json({ message: error.message });
  }

  console.error(error);
  res.status(500).json({ message: 'Internal server error' });
});

async function startServer() {
  getJwtSecret();
  await mongoose.connect(mongoUri);
  console.log('MongoDB 연결 성공');

  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to connect to MongoDB or start server:', error);
    process.exitCode = 1;
  });
}

module.exports = { resolveMongoUri };
