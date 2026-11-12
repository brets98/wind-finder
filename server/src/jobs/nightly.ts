import { addDays, localDate } from '../domain/time.js';
import { DayModel } from '../models/day.js';
import { getSettings } from '../models/settings.js';
import { SpotModel } from '../models/spot.js';
import type { DayService } from '../services/days.js';
import type { Job } from './scheduler.js';

/** After midnight, so that the day just ended is over everywhere in the app. */
export const NIGHTLY_AT = '00:30';

/**
 * For the day that just ended: saves the study days (good wind forecast or measured at a
 * study spot), then completes every Day still missing data (observations while the stations
 * still have them, both forecast runs). One spot or Day failing doesn't stop the others.
 */
export function nightlyJob(days: DayService): Job {
  async function run(now: Date) {
    const today = localDate(now);
    const yesterday = addDays(today, -1);
    const { goodWind } = await getSettings();

    let saved = 0;
    const studySpots = await SpotModel.find({ isStudySpot: true });
    for (const spot of studySpots) {
      try {
        if (await days.studyDay(spot, yesterday, goodWind, now)) saved++;
      } catch (err) {
        console.error(`Study day of ${spot.name} on ${yesterday} failed:`, err);
      }
    }

    const open = await DayModel.find({
      date: { $lt: today },
      $or: [{ forecastsFinal: false }, { 'observed.final': false }],
    });
    for (const day of open) {
      try {
        const spot = await SpotModel.findById(day.spotId);
        if (spot) await days.fill(day, spot, now, { force: true });
      } catch (err) {
        console.error(`Completing the Day ${day.id} failed:`, err);
      }
    }
    console.log(
      `Nightly: ${saved} of ${studySpots.length} study spots saved for ${yesterday}, ${open.length} Days completed`,
    );
  }

  return { name: 'nightly', schedule: () => ({ at: NIGHTLY_AT }), run };
}
