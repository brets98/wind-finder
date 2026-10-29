import mongoose from 'mongoose';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { ensureAuthIndexes } from '../src/auth/indexes.js';
import { UserModel } from '../src/models/user.js';
import { BASE_URL, createTestApp, invite, PASSWORD, signUp, type TestApp } from './app.js';
import { useTestDatabase } from './db.js';

const mario = { name: 'Mario', surname: 'Rossi', email: 'mario@example.com' };

describe('authentication', () => {
  useTestDatabase();

  let t: TestApp;
  beforeEach(async () => {
    t = createTestApp();
    await invite(mario.email);
  });

  const signUpRequest = (body: object) =>
    request(t.app).post('/api/auth/sign-up/email').set('Origin', BASE_URL).send(body);

  const signInRequest = (agent: ReturnType<typeof request.agent>, password = PASSWORD) =>
    agent
      .post('/api/auth/sign-in/email')
      .set('Origin', BASE_URL)
      .send({ email: mario.email, password });

  it('keeps the health check public', async () => {
    const res = await request(t.app).get('/api/health');

    expect(res.status).toBe(200);
  });

  it('rejects unauthenticated API requests, including unknown routes', async () => {
    expect((await request(t.app).get('/api/users')).status).toBe(401);
    expect((await request(t.app).get('/api/invites')).status).toBe(401);
    expect((await request(t.app).get('/api/does-not-exist')).status).toBe(401);
  });

  it('requires a surname on sign-up', async () => {
    const res = await signUpRequest({ name: 'Mario', email: mario.email, password: PASSWORD });

    expect(res.status).toBe(400);
  });

  it('requires a password of at least 10 characters', async () => {
    const res = await signUpRequest({ ...mario, password: 'short' });

    expect(res.status).toBe(400);
  });

  it('ignores a role sent on sign-up', async () => {
    const res = await signUpRequest({ ...mario, password: PASSWORD, role: 'admin' });

    expect(res.status).toBe(200);
    const user = await UserModel.findOne({ email: mario.email });
    expect(user?.role).toBe('user');
  });

  it('stores passwords hashed with argon2id', async () => {
    await signUpRequest({ ...mario, password: PASSWORD });

    const account = await mongoose.connection.db!.collection('accounts').findOne();
    expect(account?.password).toMatch(/^\$argon2id\$/);
  });

  it('blocks sign-in until the email is verified, then allows it', async () => {
    const res = await signUpRequest({ ...mario, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(t.mails).toHaveLength(1);
    expect(t.mails[0].to).toBe(mario.email);

    const agent = request.agent(t.app);
    expect((await signInRequest(agent)).status).toBe(403);

    await agent.get(t.lastLink(mario.email));
    await agent.post('/api/auth/sign-out').set('Origin', BASE_URL);
    expect((await agent.get('/api/users/x')).status).toBe(401);

    expect((await signInRequest(agent)).status).toBe(200);
    const user = await UserModel.findOne({ email: mario.email });
    expect((await agent.get(`/api/users/${user!.id}`)).status).toBe(200);
  });

  it('rejects a wrong password', async () => {
    await signUp(t, mario);

    expect((await signInRequest(request.agent(t.app), 'wrong-password!!')).status).toBe(401);
  });

  it('resets a forgotten password', async () => {
    await signUp(t, mario);
    const res = await request(t.app)
      .post('/api/auth/request-password-reset')
      .set('Origin', BASE_URL)
      .send({ email: mario.email, redirectTo: '/reset-password' });
    expect(res.status).toBe(200);

    const link = await request(t.app).get(t.lastLink(mario.email));
    const token = new URL(link.headers.location, BASE_URL).searchParams.get('token');
    const reset = await request(t.app)
      .post('/api/auth/reset-password')
      .set('Origin', BASE_URL)
      .send({ token, newPassword: 'a-brand-new-password' });
    expect(reset.status).toBe(200);

    const agent = request.agent(t.app);
    expect((await signInRequest(agent)).status).toBe(401);
    expect((await signInRequest(agent, 'a-brand-new-password')).status).toBe(200);
  });
});

describe('invite-only registration', () => {
  useTestDatabase();

  const signUpAs = (t: TestApp, email: string) =>
    request(t.app)
      .post('/api/auth/sign-up/email')
      .set('Origin', BASE_URL)
      .send({ ...mario, email, password: PASSWORD });

  it('refuses an email that has not been invited, without creating the user or emailing', async () => {
    const t = createTestApp();

    const res = await signUpAs(t, mario.email);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('not_invited');
    expect(await UserModel.countDocuments()).toBe(0);
    expect(t.mails).toHaveLength(0);
  });

  it('accepts an invited email regardless of case', async () => {
    const t = createTestApp();
    await invite(mario.email);

    const res = await signUpAs(t, 'Mario@Example.COM');

    expect(res.status).toBe(200);
    expect(await UserModel.exists({ email: mario.email })).toBeTruthy();
  });

  it('refuses any other way of creating a user, such as a first Google login', async () => {
    const ctx = await createTestApp().auth.$context;
    const create = () =>
      ctx.internalAdapter.createUser(
        { name: 'Mario', email: mario.email, emailVerified: true },
        { method: 'oauth', oauth: { providerId: 'google', profile: {} } },
      );

    await expect(create()).rejects.toMatchObject({ body: { code: 'not_invited' } });
    expect(await UserModel.countDocuments()).toBe(0);

    await invite(mario.email);
    await expect(create()).resolves.toMatchObject({ email: mario.email });
  });
});

describe('auth indexes', () => {
  useTestDatabase();

  it('deletes expired sessions and verification tokens', async () => {
    const db = mongoose.connection.db!;
    await ensureAuthIndexes(db);
    await ensureAuthIndexes(db); // idempotent on restart

    for (const name of ['sessions', 'verifications']) {
      const indexes = await db.collection(name).indexes();
      expect(indexes).toContainEqual(
        expect.objectContaining({ key: { expiresAt: 1 }, expireAfterSeconds: 0 }),
      );
    }
    const sessions = await db.collection('sessions').indexes();
    expect(sessions).toContainEqual(expect.objectContaining({ key: { token: 1 }, unique: true }));
  });
});
