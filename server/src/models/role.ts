import { model } from 'mongoose';
import { createSchema } from '../db/schema.js';

/** Role names used in code. Users reference a role by its `name`. */
export const ROLES = {
  admin: 'admin',
  user: 'user',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export interface Role {
  name: string;
  description: string;
}

const roleSchema = createSchema<Role>({
  name: { type: String, required: true, unique: true, trim: true, lowercase: true },
  description: { type: String, default: '', trim: true },
});

export const RoleModel = model<Role>('Role', roleSchema);

const DEFAULT_ROLES: Role[] = [
  { name: ROLES.admin, description: 'Full access, including user management' },
  { name: ROLES.user, description: 'Regular user' },
];

/** Creates the default roles if missing. Safe to run on every startup. */
export async function ensureDefaultRoles() {
  for (const role of DEFAULT_ROLES) {
    if (!(await RoleModel.exists({ name: role.name }))) {
      await RoleModel.create(role);
    }
  }
}
