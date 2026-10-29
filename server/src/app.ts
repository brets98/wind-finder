import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import type { Auth } from './auth/auth.js';
import { requireAuth } from './auth/middleware.js';
import { errorHandler } from './middleware/errors.js';
import { daysRouter } from './routes/days.js';
import { healthRouter } from './routes/health.js';
import { invitesRouter } from './routes/invites.js';
import { preferencesRouter } from './routes/preferences.js';
import { sessionsRouter } from './routes/sessions.js';
import { settingsRouter } from './routes/settings.js';
import { spotsRouter } from './routes/spots.js';
import { usersRouter } from './routes/users.js';
import type { DayService } from './services/days.js';
import type { StationService } from './services/stations.js';

export function createApp({
  auth,
  stations,
  days,
}: {
  auth: Auth;
  stations: StationService;
  days: DayService;
}) {
  const app = express();

  app.disable('x-powered-by');

  // Better Auth parses its own request bodies, so it goes before express.json()
  app.all('/api/auth/{*splat}', toNodeHandler(auth));
  app.use(express.json({ limit: '100kb' }));

  // Public routes: keep this list short (see CLAUDE.md, "API access")
  app.use('/api/health', healthRouter);

  // Everything below requires a signed-in user
  app.use('/api', requireAuth(auth));
  app.use('/api/users', usersRouter);
  app.use('/api/invites', invitesRouter);
  app.use('/api/spots', spotsRouter(stations));
  app.use('/api/sessions', sessionsRouter(days));
  app.use('/api', daysRouter(days));
  app.use('/api/settings', settingsRouter(stations));
  app.use('/api/me/preferences', preferencesRouter);

  app.use(errorHandler);

  return app;
}
