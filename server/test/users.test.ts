import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, signUp, type TestApp } from './app.js';
import { useTestDatabase } from './db.js';

const mario = { name: 'Mario', surname: 'Rossi', email: 'mario@example.com' };
const anna = { name: 'Anna', surname: 'Bianchi', email: 'anna@example.com' };

describe('users API', () => {
  useTestDatabase();

  let t: TestApp;
  beforeEach(() => {
    t = createTestApp();
  });

  describe('GET /api/users', () => {
    it('is forbidden for regular users', async () => {
      const { agent } = await signUp(t, mario);

      expect((await agent.get('/api/users')).status).toBe(403);
    });

    it('lists users in creation order for admins', async () => {
      const { agent } = await signUp(t, mario, { role: 'admin' });
      await signUp(t, anna);

      const res = await agent.get('/api/users');

      expect(res.status).toBe(200);
      expect(res.body.map((u: { email: string }) => u.email)).toEqual([mario.email, anna.email]);
      expect(res.body[0]).toHaveProperty('id');
      expect(res.body[0]).not.toHaveProperty('_id');
    });
  });

  describe('GET /api/users/:id', () => {
    it('returns your own profile with id and timestamps', async () => {
      const { agent, id } = await signUp(t, mario);

      const res = await agent.get(`/api/users/${id}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id,
        ...mario,
        emailVerified: true,
        role: 'user',
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it("is forbidden for someone else's profile", async () => {
      const { agent } = await signUp(t, mario);
      const { id: annaId } = await signUp(t, anna);

      expect((await agent.get(`/api/users/${annaId}`)).status).toBe(403);
    });

    it('lets admins read any profile', async () => {
      const { agent } = await signUp(t, mario, { role: 'admin' });
      const { id: annaId } = await signUp(t, anna);

      const res = await agent.get(`/api/users/${annaId}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(anna.email);
    });

    it('returns 404 to admins for unknown or malformed ids', async () => {
      const { agent } = await signUp(t, mario, { role: 'admin' });

      expect((await agent.get('/api/users/000000000000000000000000')).status).toBe(404);
      expect((await agent.get('/api/users/not-an-id')).status).toBe(404);
    });
  });
});
