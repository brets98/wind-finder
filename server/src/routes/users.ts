import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { requireAdmin } from '../auth/middleware.js';
import { ROLES } from '../models/role.js';
import { UserModel } from '../models/user.js';

// Users are created through registration (/api/auth/sign-up/email) or Google login.
export const usersRouter = Router();

usersRouter.get('/', requireAdmin, async (_req, res) => {
  const users = await UserModel.find().sort({ createdAt: 1 });
  res.json(users);
});

usersRouter.get('/:id', async (req, res) => {
  const { id } = req.params;
  if (req.user!.id !== id && req.user!.role !== ROLES.admin) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const user = isValidObjectId(id) ? await UserModel.findById(id) : null;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});
