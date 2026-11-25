const express = require('express');
const adminController = require('../controllers/adminController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/dashboard', authenticateToken, requireAdmin, adminController.getDashboardStats);

module.exports = router;
