import cron from 'node-cron';
import { DealFinderService } from './deal-finder.service';
import { ConfigService } from './config.service';

export class SchedulerService {
  private static activeJob: cron.ScheduledTask | null = null;
  private static currentIntervalMinutes = 60;

  static async init() {
    const config = await ConfigService.getConfig();
    this.currentIntervalMinutes = config.searchIntervalMinutes || 60;
    this.scheduleJob(this.currentIntervalMinutes);
    console.log(`Scheduler initialized. Running every ${this.currentIntervalMinutes} minutes.`);
    
    // Run once immediately on startup for testing/visibility
    setTimeout(async () => {
      const currentConfig = await ConfigService.getConfig();
      if (!currentConfig.isScannerActive) {
        console.log('Startup deal scan skipped because scanner is disabled.');
        return;
      }
      console.log('Running initial deal scan on startup...');
      try {
        await DealFinderService.searchAndPostDeals();
      } catch (err) {
        console.error('Initial startup deal scan failed:', err);
      }
    }, 5000);
  }

  static scheduleJob(minutes: number) {
    if (this.activeJob) {
      this.activeJob.stop();
    }

    // Construct cron expression
    let expression = `0 */1 * * *`; // Default: every hour
    if (minutes < 60) {
      expression = `*/${minutes} * * * *`;
    } else {
      const hours = Math.floor(minutes / 60);
      expression = `0 */${hours} * * *`;
    }

    this.activeJob = cron.schedule(expression, async () => {
      try {
        const currentConfig = await ConfigService.getConfig();
        if (!currentConfig.isScannerActive) {
          console.log('Deal scanning is currently disabled. Skipping scheduled scan.');
          return;
        }
        await DealFinderService.searchAndPostDeals();
      } catch (error) {
        console.error('Error in scheduled deal scan:', error);
      }
    });

    this.activeJob.start();
  }

  static async reload() {
    const config = await ConfigService.getConfig();
    const newInterval = config.searchIntervalMinutes || 60;

    if (newInterval !== this.currentIntervalMinutes) {
      console.log(`Rescheduling cron job from ${this.currentIntervalMinutes} to ${newInterval} minutes.`);
      this.currentIntervalMinutes = newInterval;
      this.scheduleJob(newInterval);
    }
  }
}
