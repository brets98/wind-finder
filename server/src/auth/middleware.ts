import { fromNodeHeaders } from 'better-auth/node';
import type { RequestHandler } from 'express';
import { ROLES } from '../models/role.js';
import type { Auth, AuthUser } from './auth.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Rejects requests without a valid session; sets `req.user` otherwise. */
export function requireAuth(auth: Auth): RequestHandler {
  return async (req, res, next) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    req.user = session.user;
    next();
  };
}

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.user?.role !== ROLES.admin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
};
