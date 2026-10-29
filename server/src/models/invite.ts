import { model } from 'mongoose';
import { createSchema } from '../db/schema.js';
import { normalizeEmail } from '../domain/email.js';

/**
 * An email address allowed to register (email sign-up or a first Google login).
 * Removing an invite does not remove an account already created with it.
 */
export interface Invite {
  email: string;
}

const inviteSchema = createSchema<Invite>({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
});

export const InviteModel = model<Invite>('Invite', inviteSchema);

export async function isInvited(email: string): Promise<boolean> {
  return Boolean(await InviteModel.exists({ email: normalizeEmail(email) }));
}
