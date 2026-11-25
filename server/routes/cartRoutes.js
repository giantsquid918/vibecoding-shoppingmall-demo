const express = require('express');
const cartController = require('../controllers/cartController');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

router.get('/', cartController.getCart);
router.post('/items', cartController.addItem);
router.patch('/items/:productId', cartController.updateItem);
router.delete('/items/:productId', cartController.deleteItem);
router.delete('/', cartController.deleteCart);

module.exports = router;
