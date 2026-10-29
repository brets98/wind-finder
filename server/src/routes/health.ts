import { Router } from 'express';
import mongoose from 'mongoose';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const db = mongoose.connection.readyState === mongoose.ConnectionStates.connected;
  res.json({ status: 'ok', db: db ? 'connected' : 'disconnected' });
});
