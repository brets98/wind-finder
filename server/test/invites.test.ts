import { beforeEach, describe, expect, it } from 'vitest';
import { InviteModel } from '../src/models/invite.js';
import { createTestApp, invite, signUp, type TestApp } from './app.js';
import { useTestDatabase } from './db.js';

const admin = { name: 'Luca', surname: 'Admin', email: 'admin@example.com' };
const mario = { name: 'Mario', surname: 'Rossi', email: 'mario@example.com' };

describe('invites API', () => {
  useTestDatabase();

  let t: TestApp;
  beforeEach(() => {
    t = createTestApp();
  });

  it('is forbidden for regular users', async () => {
    const { agent } = await signUp(t, mario);

    expect((await agent.get('/api/invites')).status).toBe(403);
    expect((await agent.post('/api/invites').send({ email: 'x@example.com' })).status).toBe(403);
  });

  it('lists invites by email, saying which ones already have an account', async () => {
    const { agent } = await signUp(t, admin, { role: 'admin' });
    await invite('zoe@example.com');

    const res = await agent.get('/api/invites');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({ id: expect.any(String), email: admin.email, registered: true }),
      expect.objectContaining({ email: 'zoe@example.com', registered: false }),
    ]);
    expect(res.body[0]).not.toHaveProperty('_id');
  });

  it('adds an invite, normalizing the email, and lets that person sign up', async () => {
    const { agent } = await signUp(t, admin, { role: 'admin' });

    const res = await agent.post('/api/invites').send({ email: '  Mario@Example.com ' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: mario.email, createdAt: expect.any(String) });
    await signUp(t, mario);
  });

  it('refuses an invalid or duplicate email with an issue code', async () => {
    const { agent } = await signUp(t, admin, { role: 'admin' });

    const invalid = await agent.post('/api/invites').send({ email: 'not-an-email' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.issues).toEqual([{ code: 'EMAIL_INVALID' }]);

    const duplicate = await agent.post('/api/invites').send({ email: 'ADMIN@example.com' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.issues).toEqual([{ code: 'ALREADY_INVITED' }]);
  });

  it('removes an invite, keeping an account already created with it', async () => {
    const { agent } = await signUp(t, admin, { role: 'admin' });
    await signUp(t, mario);
    const { id } = (await InviteModel.findOne({ email: mario.email }))!;

    expect((await agent.delete(`/api/invites/${id}`)).status).toBe(204);
    expect(await InviteModel.exists({ email: mario.email })).toBeNull();
    expect((await agent.get('/api/users')).body).toHaveLength(2);

    expect((await agent.delete(`/api/invites/${id}`)).status).toBe(404);
    expect((await agent.delete('/api/invites/not-an-id')).status).toBe(404);
  });
});
