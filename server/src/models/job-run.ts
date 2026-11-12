import { model } from 'mongoose';
import { createSchema } from '../db/schema.js';

/** The last run of each scheduled job, so that a restart neither repeats nor skips one. */
export interface JobRun {
  name: string;
  lastRunAt: Date;
  durationMs: number;
  /** Message of the error that stopped the last run, or null */
  error: string | null;
}

const jobRunSchema = createSchema<JobRun>({
  name: { type: String, required: true, unique: true },
  lastRunAt: { type: Date, required: true },
  durationMs: { type: Number, default: 0 },
  error: { type: String, default: null },
});

export const JobRunModel = model<JobRun>('JobRun', jobRunSchema, 'jobs');
