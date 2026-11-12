import mongoose from 'mongoose';
import { createApp } from './app.js';
import { createAuth } from './auth/auth.js';
import { ensureAuthIndexes } from './auth/indexes.js';
import { loadConfig } from './config.js';
import { createSmtpMailer } from './mail/mailer.js';
import { ensureDefaultRoles } from './models/role.js';
import { forecastRefreshJob } from './jobs/forecast-refresh.js';
import { nightlyJob } from './jobs/nightly.js';
import { notificationJobs } from './jobs/notifications.js';
import { createScheduler } from './jobs/scheduler.js';
import { createDayService } from './services/days.js';
import { createNotificationService, createWebPushSender } from './services/notifications.js';
import { createStationService } from './services/stations.js';
import { createArpav } from './sources/arpav.js';
import { createMeteoNetwork } from './sources/meteonetwork.js';
import { createLombardia } from './sources/lombardia.js';
import { createMetar } from './sources/metar.js';
import { createMeteotrentino } from './sources/meteotrentino.js';
import { createWindy } from './sources/windy.js';

const config = loadConfig();

await mongoose.connect(config.mongodbUri);
console.log('Connected to MongoDB');
await ensureDefaultRoles();
await ensureAuthIndexes(mongoose.connection.db!);

const mailer = createSmtpMailer(config.smtp);
const auth = createAuth({ db: mongoose.connection.db!, config: config.auth, mailer });

const stations = createStationService({
  meteonetwork: createMeteoNetwork(config.sources.meteonetworkToken),
  windy: createWindy(config.sources.windyApiKey),
  metar: createMetar(),
  arpav: createArpav(),
  meteotrentino: createMeteotrentino(),
  lombardia: createLombardia(config.sources.lombardiaAppToken),
});

const days = createDayService(stations);

const notifications = createNotificationService({
  stations,
  mailer,
  push: config.push ? createWebPushSender(config.push) : null,
  appUrl: config.auth.baseUrl,
});
if (!config.push) console.log('Push notifications are off: VAPID keys are not set');

const scheduler = createScheduler([
  nightlyJob(days),
  forecastRefreshJob(),
  ...notificationJobs(notifications),
]);

const server = createApp({ auth, stations, days, vapidPublicKey: config.push?.publicKey }).listen(
  config.port,
  () => {
    console.log(`API listening on port ${config.port}`);
    scheduler.start();
  },
);

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  scheduler.stop();
  server.close();
  server.closeAllConnections();
  await mongoose.disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
