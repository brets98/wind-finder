import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScheduler } from '../../src/jobs/scheduler.js';
import { JobRunModel } from '../../src/models/job-run.js';
import { useTestDatabase } from '../db.js';

const at = (utc: string) => new Date(`2026-11-12T${utc}:00Z`);

describe('scheduler', () => {
  useTestDatabase();
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs a due job once and records the run', async () => {
    const run = vi.fn(async () => {});
    const scheduler = createScheduler([{ name: 'evening', schedule: () => ({ at: '19:00' }), run }]);

    await scheduler.tick(at('17:00'));
    expect(run).not.toHaveBeenCalled();
    await scheduler.tick(at('18:00'));
    await scheduler.tick(at('18:01'));
    expect(run).toHaveBeenCalledTimes(1);
    expect(await JobRunModel.findOne({ name: 'evening' })).toMatchObject({
      lastRunAt: at('18:00'),
      error: null,
    });
  });

  it('remembers runs across restarts', async () => {
    const run = vi.fn(async () => {});
    const job = { name: 'evening', schedule: () => ({ at: '19:00' }), run };
    await createScheduler([job]).tick(at('18:00'));
    await createScheduler([job]).tick(at('18:30'));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('records a failing job and goes on with the others', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const other = vi.fn(async () => {});
    const scheduler = createScheduler([
      {
        name: 'broken',
        schedule: () => ({ everyMs: 1000 }),
        run: async () => {
          throw new Error('source down');
        },
      },
      { name: 'other', schedule: () => ({ everyMs: 1000 }), run: other },
    ]);

    await scheduler.tick(at('10:00'));
    expect(other).toHaveBeenCalledOnce();
    expect(await JobRunModel.findOne({ name: 'broken' })).toMatchObject({ error: 'source down' });
  });

  it('does not start a tick while the previous one is running', async () => {
    let release!: () => void;
    const run = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const scheduler = createScheduler([{ name: 'slow', schedule: () => ({ everyMs: 1 }), run }]);

    const first = scheduler.tick(at('10:00'));
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    await scheduler.tick(at('10:01'));
    release();
    await first;
    expect(run).toHaveBeenCalledOnce();
  });
});
