"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.optionalAuth = optionalAuth;
exports.requireRole = requireRole;
const db_js_1 = require("../db.js");
const jwt_js_1 = require("../config/jwt.js");
async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const payload = (0, jwt_js_1.verifyJwtToken)(token);
        // Check if user is suspended using direct parameterized SQL query
        const user = (0, db_js_1.queryOne)('SELECT id, email, username, role, isSuspended FROM users WHERE id = ?', [payload.id]);
        if (!user) {
            return res.status(401).json({ error: 'User no longer exists' });
        }
        if (user.isSuspended) {
            return res.status(403).json({ error: 'Account has been suspended by administration' });
        }
        req.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
        };
        next();
    }
    catch (err) {
        return res.status(401).json({ error: 'Invalid or expired authentication token' });
    }
}
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }
    const token = authHeader.split(' ')[1];
    try {
        const payload = (0, jwt_js_1.verifyJwtToken)(token);
        req.user = payload;
    }
    catch (err) {
        // Ignore invalid token in optionalAuth
    }
    next();
}
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!roles.includes(req.user.role) && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Insufficient permissions for this action' });
        }
        next();
    };
}
