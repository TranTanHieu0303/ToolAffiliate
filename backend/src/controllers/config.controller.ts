import { Request, Response } from 'express';
import { ConfigService } from '../services/config.service';
import { SchedulerService } from '../services/scheduler.service';

export class ConfigController {
  static async getConfig(req: Request, res: Response) {
    try {
      const config = await ConfigService.getConfig();
      res.json(config);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateConfig(req: Request, res: Response) {
    try {
      const updatedConfig = await ConfigService.updateConfig(req.body);
      await SchedulerService.reload(); // Reload scheduler with new interval
      res.json({ message: 'Cấu hình đã được cập nhật thành công!', config: updatedConfig });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
