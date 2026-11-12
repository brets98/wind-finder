import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubApi } from '../test/fetch';
import { NotificationsPage } from './NotificationsPage';

const subscription = {
  endpoint: 'https://push.example.com/phone',
  toJSON: () => ({ endpoint: 'https://push.example.com/phone', keys: { p256dh: 'p', auth: 'a' } }),
  unsubscribe: vi.fn(async () => true),
};

/** A browser with push support and no subscription yet; `permission` is the user's answer. */
function stubPushBrowser(permission: NotificationPermission) {
  const pushManager = {
    getSubscription: vi.fn(async () => null as typeof subscription | null),
    subscribe: vi.fn(async () => subscription),
  };
  const registration = { pushManager };
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: vi.fn(async () => permission),
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: vi.fn(async () => registration),
      register: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
    },
  });
  return pushManager;
}

describe('NotificationsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('turns the evening email off', async () => {
    const fetchMock = stubApi(
      ['GET', '/api/me/preferences', { body: { unit: 'knots', email: true } }],
      ['PATCH', '/api/me/preferences', { body: { unit: 'knots', email: false } }],
    );
    render(<NotificationsPage />);

    const checkbox = await screen.findByLabelText('Send me the evening email');
    expect(checkbox).toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ email: false });
  });

  it('says when the browser has no push', async () => {
    stubApi(['GET', '/api/me/preferences', { body: { unit: 'knots', email: true } }]);
    render(<NotificationsPage />);
    expect(
      await screen.findByText('This browser does not support push notifications.'),
    ).toBeInTheDocument();
  });

  it('turns push on from the button, after the permission is granted', async () => {
    const pushManager = stubPushBrowser('granted');
    const fetchMock = stubApi(
      ['GET', '/api/me/preferences', { body: { unit: 'knots', email: true } }],
      ['GET', '/api/push/key', { body: { publicKey: 'BEl6Wk9TbHYtc29tZS1rZXk' } }],
      ['POST', '/api/push/subscriptions', { status: 201, body: {} }],
    );
    render(<NotificationsPage />);

    // Never asked on page load
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on push' }));
    expect(await screen.findByText('On: this device gets the daily push.')).toBeInTheDocument();
    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({ endpoint: subscription.endpoint });
  });

  it('explains how to unblock notifications when the permission is refused', async () => {
    const pushManager = stubPushBrowser('denied');
    stubApi(
      ['GET', '/api/me/preferences', { body: { unit: 'knots', email: true } }],
      ['GET', '/api/push/key', { body: { publicKey: 'BEl6Wk9TbHYtc29tZS1rZXk' } }],
    );
    render(<NotificationsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Turn on push' }));
    expect(await screen.findByText(/Notifications are blocked/)).toBeInTheDocument();
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });
});
