import { Router } from 'express';
import { isValidObjectId } from 'mongoose';
import { requireAdmin } from '../auth/middleware.js';
import { isValidEmail, normalizeEmail } from '../domain/email.js';
import { InviteModel } from '../models/invite.js';
import { UserModel } from '../models/user.js';

/** Admin only: the email addresses allowed to register. */
export const invitesRouter = Router();

invitesRouter.use(requireAdmin);

/** Each invite says whether an account already exists for its email (`registered`). */
invitesRouter.get('/', async (_req, res) => {
  const invites = await InviteModel.find().sort({ email: 1 });
  const registered = new Set(
    (await UserModel.find({ email: { $in: invites.map((i) => i.email) } }, { email: 1 })).map(
      (u) => u.email,
    ),
  );
  res.json(invites.map((i) => ({ ...i.toJSON(), registered: registered.has(i.email) })));
});

invitesRouter.post('/', async (req, res) => {
  const email = normalizeEmail(String(req.body?.email ?? ''));
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Invalid email', issues: [{ code: 'EMAIL_INVALID' }] });
    return;
  }
  if (await InviteModel.exists({ email })) {
    res.status(409).json({ error: 'Already invited', issues: [{ code: 'ALREADY_INVITED' }] });
    return;
  }
  const invite = await InviteModel.create({ email });
  res.status(201).json(invite);
});

invitesRouter.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const invite = isValidObjectId(id) ? await InviteModel.findByIdAndDelete(id) : null;
  if (!invite) {
    res.status(404).json({ error: 'Invite not found' });
    return;
  }
  res.status(204).end();
});
