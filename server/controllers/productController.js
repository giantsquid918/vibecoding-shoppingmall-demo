const Product = require('../models/Product');
const Order = require('../models/Order');

const productFields = ['productId', 'name', 'price', 'category', 'image', 'description'];

function hasValidBody(req, res) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ message: 'Request body must be a JSON object' });
    return false;
  }

  return true;
}

function pickProductFields(body) {
  return Object.fromEntries(
    productFields
      .filter((field) => Object.hasOwn(body, field))
      .map((field) => [field, body[field]]),
  );
}

function getProductId(req, res) {
  const productId = req.params.productId.trim();
  if (!productId) {
    res.status(400).json({ message: 'Product ID is required' });
    return null;
  }

  return productId;
}

async function createProduct(req, res, next) {
  if (!hasValidBody(req, res)) return;

  try {
    const product = new Product(pickProductFields(req.body));
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
}

async function getProducts(req, res, next) {
  try {
    if (req.query?.sort === 'best-selling') {
      const [products, sales] = await Promise.all([
        Product.find().sort({ createdAt: -1, _id: -1 }).lean(),
        Order.aggregate([
          { $match: { 'payment.status': 'paid', fulfillmentStatus: { $ne: 'cancelled' } } },
          { $unwind: '$items' },
          { $match: { 'items.product': { $ne: null } } },
          { $group: { _id: '$items.product', quantity: { $sum: '$items.quantity' } } },
        ]),
      ]);
      const quantities = new Map(sales.map((sale) => [String(sale._id), sale.quantity]));
      products.sort((a, b) =>
        (quantities.get(String(b._id)) || 0) - (quantities.get(String(a._id)) || 0),
      );
      return res.json(products.map((product, index) => ({
        ...product,
        salesRank: index < 3 && (quantities.get(String(product._id)) || 0) > 0
          ? index + 1
          : null,
      })));
    }

    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    next(error);
  }
}

async function getProduct(req, res, next) {
  const productId = getProductId(req, res);
  if (!productId) return;

  try {
    const product = await Product.findOne({ productId });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    res.json(product);
  } catch (error) {
    next(error);
  }
}

async function updateProduct(req, res, next) {
  if (!hasValidBody(req, res)) return;

  const productId = getProductId(req, res);
  if (!productId) return;

  const updates = pickProductFields(req.body);
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'No valid product fields provided' });
  }

  try {
    const product = await Product.findOne({ productId });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    Object.assign(product, updates);
    await product.save();
    res.json(product);
  } catch (error) {
    next(error);
  }
}

async function deleteProduct(req, res, next) {
  const productId = getProductId(req, res);
  if (!productId) return;

  try {
    const product = await Product.findOneAndDelete({ productId });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createProduct,
  deleteProduct,
  getProduct,
  getProducts,
  updateProduct,
};
