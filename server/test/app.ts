import mongoose from 'mongoose';
import request from 'supertest';
import { expect } from 'vitest';
import { createApp } from '../src/app.js';
import { createAuth } from '../src/auth/auth.js';
import type { Mail } from '../src/mail/mailer.js';
import { InviteModel } from '../src/models/invite.js';
import { UserModel } from '../src/models/user.js';
import { createStationService } from '../src/services/stations.js';
import { createMeteoNetwork } from '../src/sources/meteonetwork.js';
import { createWindy } from '../src/sources/windy.js';

export const BASE_URL = 'http://localhost:3000';

/**
 * Builds the app against the test database, capturing emails instead of sending them.
 * Sources use fake credentials: stub their HTTP calls with `stubFetch()` (test/fetch.ts).
 */
export function createTestApp() {
  const mails: Mail[] = [];
  const auth = createAuth({
    db: mongoose.connection.db!,
    config: { secret: 'test-secret-that-is-at-least-32-characters', baseUrl: BASE_URL },
    mailer: async (mail) => {
      mails.push(mail);
    },
  });
  const stations = createStationService({
    meteonetwork: createMeteoNetwork('test-meteonetwork-token'),
    windy: createWindy('test-windy-key'),
  });
  const app = createApp({ auth, stations });

  /** Path + query of the last link emailed to `to`. */
  function lastLink(to: string) {
    const mail = mails.findLast((m) => m.to === to);
    const url = mail?.text.match(/https?:\/\/\S+/)?.[0];
    if (!url) throw new Error(`No link emailed to ${to}`);
    const { pathname, search } = new URL(url);
    return pathname + search;
  }

  return { app, auth, stations, mails, lastLink };
}

export type TestApp = ReturnType<typeof createTestApp>;

export const PASSWORD = 'correct-horse-battery';

export async function invite(email: string) {
  await InviteModel.updateOne({ email }, { email }, { upsert: true });
}

/** Invites, signs up and verifies a user; returns a cookie-keeping agent signed in as them. */
export async function signUp(
  { app, lastLink }: TestApp,
  user: { name: string; surname: string; email: string },
  { role }: { role?: 'admin' } = {},
) {
  await invite(user.email);
  const agent = request.agent(app);
  const res = await agent
    .post('/api/auth/sign-up/email')
    .set('Origin', BASE_URL)
    .send({ ...user, password: PASSWORD });
  expect(res.status).toBe(200);

  if (role) {
    await UserModel.updateOne({ email: user.email }, { role });
  }

  const verified = await agent.get(lastLink(user.email));
  expect(verified.status).toBe(302);

  const me = await UserModel.findOne({ email: user.email });
  return { agent, id: me!.id as string };
}
