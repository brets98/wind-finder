import { apiDelete, apiGet, apiPost } from './api';

/**
 * Push on this device: `on`/`off`, or why it can't be used. `ios-install`: iPhone and iPad
 * support web push only in the app installed on the Home Screen.
 */
export type PushState = 'on' | 'off' | 'denied' | 'unsupported' | 'ios-install' | 'server-off';

const isIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  // iPadOS presents itself as a Mac with a touch screen
  (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as { standalone?: boolean }).standalone === true;

const supported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** The VAPID public key (base64url) as the bytes PushManager.subscribe() wants. */
function keyBytes(base64url: string) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** The server must know this device for the signed-in user (it may have been someone else's). */
const save = (subscription: PushSubscription) =>
  apiPost('/push/subscriptions', subscription.toJSON());

export async function pushState(): Promise<PushState> {
  if (!supported()) return isIos() && !isStandalone() ? 'ios-install' : 'unsupported';
  const { publicKey } = await apiGet<{ publicKey: string | null }>('/push/key');
  if (!publicKey) return 'server-off';
  if (Notification.permission === 'denied') return 'denied';
  const subscription = await currentSubscription();
  if (!subscription) return 'off';
  await save(subscription);
  return 'on';
}

/**
 * Asks the permission (call it from a button, never on page load) and subscribes this device.
 * The service worker is registered here too, so that push also works in development.
 */
export async function enablePush(): Promise<PushState> {
  const { publicKey } = await apiGet<{ publicKey: string | null }>('/push/key');
  if (!publicKey) return 'server-off';
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  await navigator.serviceWorker.register('/sw.js');
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  await save(subscription);
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const subscription = await currentSubscription();
  if (subscription) {
    await apiDelete('/push/subscriptions', { endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
  return 'off';
}
