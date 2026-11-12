import { isDue, type Schedule } from '../domain/schedule.js';
import { JobRunModel } from '../models/job-run.js';

export interface Job {
  name: string;
  /** Read at every tick, so that a time changed in the settings applies at once */
  schedule: () => Promise<Schedule> | Schedule;
  run: (now: Date) => Promise<void>;
}

/** How often the scheduler looks for due jobs. */
export const TICK_MS = 60 * 1000;

/**
 * In-process scheduler (single server instance): every minute it runs the due jobs one after
 * the other. Each run is recorded in the `jobs` collection and logged; a failing job is
 * logged and tried again at its next time, never crashing the server.
 */
export function createScheduler(jobs: Job[]) {
  let running = false;
  let timer: NodeJS.Timeout | undefined;

  async function runJob(job: Job, now: Date) {
    const started = Date.now();
    let error: string | null = null;
    console.log(`Job ${job.name}: started`);
    try {
      await job.run(now);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      console.error(`Job ${job.name} failed:`, err);
    }
    const durationMs = Date.now() - started;
    await JobRunModel.updateOne(
      { name: job.name },
      { lastRunAt: now, durationMs, error },
      { upsert: true },
    );
    if (!error) console.log(`Job ${job.name}: done in ${durationMs} ms`);
  }

  /** Runs the jobs due at `now`; a tick that starts while the last one runs does nothing. */
  async function tick(now = new Date()) {
    if (running) return;
    running = true;
    try {
      for (const job of jobs) {
        const last = await JobRunModel.findOne({ name: job.name });
        if (isDue(await job.schedule(), last?.lastRunAt ?? null, now)) await runJob(job, now);
      }
    } catch (err) {
      console.error('Scheduler tick failed:', err);
    } finally {
      running = false;
    }
  }

  return {
    tick,
    start() {
      timer = setInterval(() => void tick(), TICK_MS);
      void tick();
    },
    stop() {
      clearInterval(timer);
    },
  };
}

export type Scheduler = ReturnType<typeof createScheduler>;
