const express = require('express');
const productController = require('../controllers/productController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', productController.getProducts);
router.get('/:productId', productController.getProduct);
router.post('/', authenticateToken, requireAdmin, productController.createProduct);
router.patch(
  '/:productId',
  authenticateToken,
  requireAdmin,
  productController.updateProduct,
);
router.delete(
  '/:productId',
  authenticateToken,
  requireAdmin,
  productController.deleteProduct,
);

module.exports = router;
