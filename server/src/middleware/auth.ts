import { Request, Response, NextFunction } from 'express';
import { queryOne } from '../db.js';
import { verifyJwtToken } from '../config/jwt.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyJwtToken(token);
    
    // Check if user is suspended using direct parameterized SQL query
    const user = queryOne<{ id: string; email: string; username: string; role: string; isSuspended: number }>(
      'SELECT id, email, username, role, isSuspended FROM users WHERE id = ?',
      [payload.id]
    );

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
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = verifyJwtToken(token);
    req.user = payload;
  } catch (err) {
    // Ignore invalid token in optionalAuth
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role) && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}
