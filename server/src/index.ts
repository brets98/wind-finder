import mongoose from 'mongoose';
import { createApp } from './app.js';
import { createAuth } from './auth/auth.js';
import { ensureAuthIndexes } from './auth/indexes.js';
import { loadConfig } from './config.js';
import { createSmtpMailer } from './mail/mailer.js';
import { ensureDefaultRoles } from './models/role.js';
import { createStationService } from './services/stations.js';
import { createMeteoNetwork } from './sources/meteonetwork.js';
import { createWindy } from './sources/windy.js';

const config = loadConfig();

await mongoose.connect(config.mongodbUri);
console.log('Connected to MongoDB');
await ensureDefaultRoles();
await ensureAuthIndexes(mongoose.connection.db!);

const auth = createAuth({
  db: mongoose.connection.db!,
  config: config.auth,
  mailer: createSmtpMailer(config.smtp),
});

const stations = createStationService({
  meteonetwork: createMeteoNetwork(config.sources.meteonetworkToken),
  windy: createWindy(config.sources.windyApiKey),
});

const server = createApp({ auth, stations }).listen(config.port, () => {
  console.log(`API listening on port ${config.port}`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close();
  server.closeAllConnections();
  await mongoose.disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
