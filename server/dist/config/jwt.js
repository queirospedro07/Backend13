"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWT_EXPIRES_IN = exports.JWT_SECRET = void 0;
exports.signJwtToken = signJwtToken;
exports.verifyJwtToken = verifyJwtToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// Fallback development secret (never used in hardened production)
const DEV_FALLBACK_SECRET = 'learnspace-default-dev-secret-key-32-chars-minimum';
const secretFromEnv = process.env.JWT_SECRET;
if (process.env.NODE_ENV === 'production' && (!secretFromEnv || secretFromEnv === DEV_FALLBACK_SECRET)) {
    console.warn('[SECURITY WARNING]: JWT_SECRET is using a default or missing value in production! ' +
        'Please set a cryptographically secure 256-bit string in server/.env');
}
exports.JWT_SECRET = secretFromEnv || DEV_FALLBACK_SECRET;
exports.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
/**
 * Signs a JWT with non-sensitive claims and strict HS256 algorithm
 */
function signJwtToken(payload) {
    return jsonwebtoken_1.default.sign({
        id: payload.id,
        email: payload.email,
        username: payload.username,
        role: payload.role,
    }, exports.JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: exports.JWT_EXPIRES_IN,
    });
}
/**
 * Strictly verifies JWT signature and expiration using HS256 to prevent algorithm confusion attacks
 */
function verifyJwtToken(token) {
    return jsonwebtoken_1.default.verify(token, exports.JWT_SECRET, {
        algorithms: ['HS256'],
    });
}
