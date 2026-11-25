const jwt = require('jsonwebtoken');

const accessTokenLifetimeSeconds = 60 * 60;

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('JWT_SECRET must be set to a secret of at least 32 bytes');
  }

  return secret;
}

function createAccessToken(user) {
  return jwt.sign(
    { user_type: user.user_type },
    getJwtSecret(),
    {
      algorithm: 'HS256',
      audience: 'shoppingmall-client',
      expiresIn: accessTokenLifetimeSeconds,
      issuer: 'shoppingmall-api',
      subject: String(user._id),
    },
  );
}

function authenticateToken(req, res, next) {
  const authorization = req.get('authorization') || '';
  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  if (!match) {
    return res.status(401).json({ message: '인증 토큰이 필요합니다.' });
  }

  try {
    const claims = jwt.verify(match[1], getJwtSecret(), {
      algorithms: ['HS256'],
      audience: 'shoppingmall-client',
      issuer: 'shoppingmall-api',
    });

    if (
      typeof claims !== 'object' ||
      typeof claims.sub !== 'string' ||
      !['admin', 'customer'].includes(claims.user_type)
    ) {
      return res.status(401).json({ message: '유효하지 않은 인증 토큰입니다.' });
    }

    req.auth = { userId: claims.sub, userType: claims.user_type };
    return next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: '유효하지 않거나 만료된 인증 토큰입니다.' });
    }

    return next(error);
  }
}

function requireAdmin(req, res, next) {
  if (req.auth.userType !== 'admin') {
    return res.status(403).json({ message: '관리자 권한이 필요합니다.' });
  }

  return next();
}

function requireSelfOrAdmin(req, res, next) {
  if (req.auth.userType !== 'admin' && req.auth.userId !== req.params.id) {
    return res.status(403).json({ message: '본인 정보에만 접근할 수 있습니다.' });
  }

  return next();
}

module.exports = {
  ACCESS_TOKEN_LIFETIME_SECONDS: accessTokenLifetimeSeconds,
  authenticateToken,
  createAccessToken,
  getJwtSecret,
  requireAdmin,
  requireSelfOrAdmin,
};
