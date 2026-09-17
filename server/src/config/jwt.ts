import jwt from 'jsonwebtoken';

// Fallback development secret (never used in hardened production)
const DEV_FALLBACK_SECRET = 'learnspace-default-dev-secret-key-32-chars-minimum';

const secretFromEnv = process.env.JWT_SECRET;

if (process.env.NODE_ENV === 'production' && (!secretFromEnv || secretFromEnv === DEV_FALLBACK_SECRET)) {
  console.warn(
    '[SECURITY WARNING]: JWT_SECRET is using a default or missing value in production! ' +
    'Please set a cryptographically secure 256-bit string in server/.env'
  );
}

export const JWT_SECRET = secretFromEnv || DEV_FALLBACK_SECRET;
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface JwtUserPayload {
  id: string;
  email: string;
  username: string;
  role: string;
}

/**
 * Signs a JWT with non-sensitive claims and strict HS256 algorithm
 */
export function signJwtToken(payload: JwtUserPayload): string {
  return jwt.sign(
    {
      id: payload.id,
      email: payload.email,
      username: payload.username,
      role: payload.role,
    },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: JWT_EXPIRES_IN,
    } as jwt.SignOptions
  );
}

/**
 * Strictly verifies JWT signature and expiration using HS256 to prevent algorithm confusion attacks
 */
export function verifyJwtToken(token: string): JwtUserPayload {
  return jwt.verify(token, JWT_SECRET, {
    algorithms: ['HS256'],
  }) as JwtUserPayload;
}
