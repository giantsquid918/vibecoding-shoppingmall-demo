const express = require('express');
const orderController = require('../controllers/orderController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

router.get('/admin', requireAdmin, orderController.listAdminOrders);
router.get('/', orderController.listOrders);
router.post('/preflight', orderController.preflightOrder);
router.post('/', orderController.createOrder);
router.patch('/:orderNumber/status', requireAdmin, orderController.updateOrderStatus);
router.patch('/:orderNumber/shipping', requireAdmin, orderController.updateOrderShipping);
router.post('/:orderNumber/verify-payment', orderController.verifyPayment);
router.post('/:orderNumber/cancel', orderController.cancelOrder);

module.exports = router;
