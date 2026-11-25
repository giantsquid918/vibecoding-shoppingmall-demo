const express = require('express');
const userController = require('../controllers/userController');
const {
  authenticateToken,
  requireAdmin,
  requireSelfOrAdmin,
} = require('../middleware/auth');

const router = express.Router();

// POST /api/users/login: 이메일과 비밀번호로 로그인
router.post('/login', userController.login);
// POST /api/users: 사용자 생성
router.post('/', userController.createUser);
router.patch('/me/password', authenticateToken, userController.changePassword);
router.delete('/me', authenticateToken, userController.withdrawCurrentUser);
// GET /api/users/check-phone/:phone: 휴대폰 번호 중복 확인
router.get('/check-phone/:phone', userController.checkPhone);
// GET /api/users: 관리자만 전체 사용자 조회
router.get('/', authenticateToken, requireAdmin, userController.getUsers);
// GET /api/users/me: 토큰의 사용자 정보 조회
router.get('/me', authenticateToken, userController.getCurrentUser);
// GET /api/users/:id: 본인 또는 관리자만 사용자 조회
router.get('/:id', authenticateToken, requireSelfOrAdmin, userController.getUser);
// PATCH /api/users/:id: 본인 또는 관리자만 사용자 정보 수정
router.patch('/:id', authenticateToken, requireSelfOrAdmin, userController.updateUser);
// DELETE /api/users/:id: 관리자만 다른 사용자 계정 삭제
router.delete('/:id', authenticateToken, requireAdmin, userController.deleteUser);

// 서버에서 사용자 API 경로에 연결할 수 있도록 라우터를 내보냅니다.
module.exports = router;
