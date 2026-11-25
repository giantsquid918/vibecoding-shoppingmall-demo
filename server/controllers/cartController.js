const Cart = require('../models/Cart');
const Product = require('../models/Product');

function hasValidBody(req, res) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ message: 'Request body must be a JSON object' });
    return false;
  }

  return true;
}

function getProductId(value, res) {
  if (typeof value !== 'string' || !value.trim()) {
    res.status(400).json({ message: 'Product ID is required' });
    return null;
  }

  return value.trim();
}

function getQuantity(value, res, defaultValue) {
  const quantity = value === undefined ? defaultValue : value;
  if (!Number.isInteger(quantity) || quantity < 1) {
    res.status(400).json({ message: 'Quantity must be a positive integer' });
    return null;
  }

  return quantity;
}

async function getCart(req, res, next) {
  try {
    const cart = await Cart.findOne({ user: req.auth.userId }).populate('items.product');
    res.json(cart || { items: [], totalAmount: 0 });
  } catch (error) {
    next(error);
  }
}

async function addItem(req, res, next) {
  if (!hasValidBody(req, res)) return;

  const productId = getProductId(req.body.productId, res);
  if (!productId) return;

  const quantity = getQuantity(req.body.quantity, res, 1);
  if (!quantity) return;

  try {
    const product = await Product.findOne({ productId });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    let cart = await Cart.findOne({ user: req.auth.userId });
    if (!cart) {
      cart = new Cart({ user: req.auth.userId, items: [] });
    }

    const item = cart.items.find(
      (cartItem) => String(cartItem.product) === String(product._id),
    );
    const isNewItem = !item;
    if (item) {
      item.quantity += quantity;
    } else {
      cart.items.push({
        product: product._id,
        unitPrice: product.price,
        quantity,
      });
    }

    await cart.save();
    await cart.populate('items.product');
    res.status(isNewItem ? 201 : 200).json(cart);
  } catch (error) {
    next(error);
  }
}

async function updateItem(req, res, next) {
  if (!hasValidBody(req, res)) return;

  const productId = getProductId(req.params.productId, res);
  if (!productId) return;

  const quantity = getQuantity(req.body.quantity, res);
  if (!quantity) return;

  try {
    const product = await Product.findOne({ productId });
    if (!product) return res.status(404).json({ message: 'Cart item not found' });

    const cart = await Cart.findOne({ user: req.auth.userId });
    const item = cart?.items.find(
      (cartItem) => String(cartItem.product) === String(product._id),
    );
    if (!item) return res.status(404).json({ message: 'Cart item not found' });

    item.quantity = quantity;
    await cart.save();
    await cart.populate('items.product');
    res.json(cart);
  } catch (error) {
    next(error);
  }
}

async function deleteItem(req, res, next) {
  const productId = getProductId(req.params.productId, res);
  if (!productId) return;

  try {
    const product = await Product.findOne({ productId });
    if (!product) return res.status(404).json({ message: 'Cart item not found' });

    const cart = await Cart.findOne({ user: req.auth.userId });
    const item = cart?.items.find(
      (cartItem) => String(cartItem.product) === String(product._id),
    );
    if (!item) return res.status(404).json({ message: 'Cart item not found' });

    item.deleteOne();
    await cart.save();
    await cart.populate('items.product');
    res.json(cart);
  } catch (error) {
    next(error);
  }
}

async function deleteCart(req, res, next) {
  try {
    await Cart.findOneAndDelete({ user: req.auth.userId });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  addItem,
  deleteCart,
  deleteItem,
  getCart,
  updateItem,
};
