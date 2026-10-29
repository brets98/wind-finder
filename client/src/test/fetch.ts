import { vi } from 'vitest';

type Route = [method: string, path: string, response: { status?: number; body?: unknown }];

/**
 * Stubs fetch with answers by method and API path (e.g. ['GET', '/api/spots', { body: [] }]).
 * A path ending in * matches by prefix. Unknown calls answer 404.
 */
export function stubApi(...routes: Route[]) {
  const mock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const route = routes.find(
      ([m, path]) =>
        m === method && (path.endsWith('*') ? url.startsWith(path.slice(0, -1)) : url === path),
    );
    const { status = 200, body } = route?.[2] ?? { status: 404, body: { error: 'Not found' } };
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}
