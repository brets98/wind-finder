import { Router } from 'express';
import { PushSubscriptionModel } from '../models/push-subscription.js';

const isText = (value: unknown, max = 2048): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;

/**
 * The signed-in user's devices for push notifications. `publicKey` is null when the server
 * has no VAPID keys (push off).
 */
export function pushRouter(publicKey: string | null) {
  const router = Router();

  router.get('/key', (_req, res) => {
    res.json({ publicKey });
  });

  /** Saves this device's subscription (from PushManager.subscribe()) for the user. */
  router.post('/subscriptions', async (req, res) => {
    const { endpoint, keys } = req.body ?? {};
    if (!publicKey) {
      res.status(503).json({ error: 'Push is off', issues: [{ code: 'PUSH_OFF' }] });
      return;
    }
    if (
      !isText(endpoint) ||
      !/^https:\/\//.test(endpoint) ||
      !isText(keys?.p256dh, 256) ||
      !isText(keys?.auth, 256)
    ) {
      res.status(400).json({ error: 'Invalid subscription', issues: [{ code: 'INVALID' }] });
      return;
    }
    // One device, one user: whoever subscribes last on this browser gets its pushes
    await PushSubscriptionModel.updateOne(
      { endpoint },
      { userId: req.user!.id, keys: { p256dh: keys.p256dh, auth: keys.auth } },
      { upsert: true },
    );
    res.status(201).json({ endpoint });
  });

  /** Forgets one of the user's devices. */
  router.delete('/subscriptions', async (req, res) => {
    const { endpoint } = req.body ?? {};
    if (!isText(endpoint)) {
      res.status(400).json({ error: 'Invalid subscription', issues: [{ code: 'INVALID' }] });
      return;
    }
    await PushSubscriptionModel.deleteOne({ endpoint, userId: req.user!.id });
    res.status(204).end();
  });

  return router;
}
