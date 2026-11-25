const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

async function getDashboardStats(req, res, next) {
  try {
    const [totalOrders, totalProducts, totalCustomers, revenueResult] = await Promise.all([
      Order.countDocuments(),
      Product.countDocuments(),
      User.countDocuments({ user_type: 'customer' }),
      Order.aggregate([
        { $match: { 'payment.status': 'paid' } },
        { $group: { _id: null, totalRevenue: { $sum: '$amounts.totalAmount' } } },
      ]),
    ]);

    res.json({
      totalOrders,
      totalProducts,
      totalCustomers,
      totalRevenue: revenueResult[0]?.totalRevenue || 0,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getDashboardStats };
