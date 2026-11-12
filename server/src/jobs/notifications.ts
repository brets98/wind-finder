import { getSettings } from '../models/settings.js';
import type { NotificationService } from '../services/notifications.js';
import type { Job } from './scheduler.js';

/** A notification more than two hours late (the server was down) is not sent that day. */
export const NOTIFICATION_GRACE_MINUTES = 120;

/** The daily push and the evening email, at the times in the global settings. */
export function notificationJobs(notifications: NotificationService): Job[] {
  return [
    {
      name: 'push',
      schedule: async () => ({
        at: (await getSettings()).notifications.pushAt,
        graceMinutes: NOTIFICATION_GRACE_MINUTES,
      }),
      run: async (now) => {
        const { sent } = await notifications.sendPush(now);
        console.log(`Push: sent to ${sent} users`);
      },
    },
    {
      name: 'email',
      schedule: async () => ({
        at: (await getSettings()).notifications.emailAt,
        graceMinutes: NOTIFICATION_GRACE_MINUTES,
      }),
      run: async (now) => {
        const { sent } = await notifications.sendEmails(now);
        console.log(`Email: sent to ${sent} users`);
      },
    },
  ];
}
