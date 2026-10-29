import { vi } from 'vitest';

export type FakeResponse = { status?: number; body?: unknown };
export type FakeHandler = (url: URL, init: RequestInit) => FakeResponse | undefined;

/**
 * Replaces the global fetch used by the source adapters. Each call goes to the first handler
 * that answers; an unanswered call fails the test with its URL. Undo with vi.unstubAllGlobals().
 */
export function stubFetch(...handlers: FakeHandler[]) {
  const mock = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : input);
    for (const handler of handlers) {
      const res = handler(url, init);
      if (res) {
        const { status = 200, body } = res;
        return new Response(body === undefined ? null : JSON.stringify(body), { status });
      }
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** A handler answering requests whose URL starts with `prefix`. */
export function on(
  prefix: string,
  response: FakeResponse | ((url: URL) => FakeResponse),
): FakeHandler {
  return (url) =>
    url.toString().startsWith(prefix)
      ? typeof response === 'function'
        ? response(url)
        : response
      : undefined;
}
