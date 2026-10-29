import { describe, expect, it } from 'vitest';
import { ensureDefaultRoles, RoleModel } from '../src/models/role.js';
import { useTestDatabase } from './db.js';

describe('roles', () => {
  useTestDatabase();

  it('creates the admin and user roles with id and timestamps', async () => {
    await ensureDefaultRoles();

    const roles = (await RoleModel.find().sort({ name: 1 })).map((r) => r.toJSON());
    expect(roles).toEqual([
      expect.objectContaining({
        id: expect.any(String),
        name: 'admin',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
      expect.objectContaining({ name: 'user' }),
    ]);
  });

  it('can run on every startup without duplicating or changing roles', async () => {
    await ensureDefaultRoles();
    await RoleModel.updateOne({ name: 'user' }, { description: 'Edited by hand' });

    await ensureDefaultRoles();

    expect(await RoleModel.countDocuments()).toBe(2);
    expect((await RoleModel.findOne({ name: 'user' }))?.description).toBe('Edited by hand');
  });
});
