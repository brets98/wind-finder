/**
 * Shared HTTP plumbing for the source adapters: a real, descriptive User-Agent (MeteoNetwork
 * and Overpass ask for one), a timeout, and JSON parsing. Uses the global fetch, which tests stub.
 */
export const USER_AGENT =
  'WindFinder/0.1 (personal non-commercial app; +https://github.com/brets98/wind-finder)';

const DEFAULT_TIMEOUT_MS = 15_000;

export class SourceError extends Error {
  constructor(
    public source: string,
    public status: number,
    message: string,
  ) {
    super(`${source}: ${message}`);
  }
}

export async function fetchJson<T>(
  source: string,
  url: string,
  { headers, timeoutMs = DEFAULT_TIMEOUT_MS, ...init }: RequestInit & { timeoutMs?: number } = {},
): Promise<{ status: number; body: T }> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new SourceError(source, 0, err instanceof Error ? err.message : 'request failed');
  }
  const text = await res.text();
  let body: T;
  try {
    body = (text ? JSON.parse(text) : null) as T;
  } catch {
    throw new SourceError(source, res.status, `invalid JSON (HTTP ${res.status})`);
  }
  return { status: res.status, body };
}

/** A text response (e.g. XML), decoded with `encoding` (default UTF-8). */
export async function fetchText(
  source: string,
  url: string,
  {
    encoding = 'utf-8',
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: { encoding?: string; timeoutMs?: number } = {},
): Promise<{ status: number; text: string }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: res.status, text: new TextDecoder(encoding).decode(await res.arrayBuffer()) };
  } catch (err) {
    throw new SourceError(source, 0, err instanceof Error ? err.message : 'request failed');
  }
}

/** A box of ±`radiusKm` around a point, in degrees (for searches by bounding box). */
export function boundingBox({ lat, lon }: { lat: number; lon: number }, radiusKm: number) {
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLon: lon - dLon, maxLon: lon + dLon };
}

/**
 * Keeps calls to one service under `max` per `windowMs`, waiting when needed. In-process,
 * like the rest of the app's state: it assumes a single server instance.
 */
export class RateLimiter {
  private calls: number[] = [];
  private queue = Promise.resolve();

  constructor(
    private max: number,
    private windowMs: number,
    private now = () => Date.now(),
    private sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  ) {}

  /** Runs `fn` once a slot is free; calls run one at a time, in order. */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      this.calls = this.calls.filter((t) => this.now() - t < this.windowMs);
      if (this.calls.length >= this.max) {
        await this.sleep(this.windowMs - (this.now() - this.calls[0]));
        this.calls.shift();
      }
      this.calls.push(this.now());
      return fn();
    });
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

/** Speeds in other units, to knots with one decimal. */
export const toKnots = {
  fromMs: (ms: number) => Math.round(ms * 1.943844 * 10) / 10,
  fromKmh: (kmh: number) => Math.round((kmh / 1.852) * 10) / 10,
};

/** A number from an API value that may be a string, empty or missing. */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
