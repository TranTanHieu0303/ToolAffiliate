import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { AIService } from '../services/ai.service';
import { TelegramService } from '../services/telegram.service';
import { DealFinderService } from '../services/deal-finder.service';

export class DealController {
  static async getDeals(req: Request, res: Response) {
    const { platform, status, page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where: any = {};
    if (platform) where.platform = String(platform);
    if (status) where.status = String(status);

    try {
      const total = await prisma.deal.count({ where });
      const deals = await prisma.deal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      });

      res.json({
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / take),
        data: deals,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async sendToTelegram(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const deal = await prisma.deal.findUnique({ where: { id } });
      if (!deal) {
        return res.status(404).json({ error: 'Không tìm thấy deal' });
      }

      if (!deal.aiCaption) {
        return res.status(400).json({ error: 'Deal này chưa có caption' });
      }

      const sent = await TelegramService.sendMessage(deal.aiCaption, deal.imageUrl || undefined);

      if (sent) {
        await prisma.deal.update({
          where: { id },
          data: { status: 'SENT', sentAt: new Date() },
        });
        res.json({ message: 'Đã gửi deal thành công lên Telegram!' });
      } else {
        res.status(500).json({ error: 'Không thể gửi lên Telegram. Vui lòng kiểm tra lại cấu hình bot.' });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async regenerateCaption(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const deal = await prisma.deal.findUnique({ where: { id } });
      if (!deal) {
        return res.status(404).json({ error: 'Không tìm thấy deal' });
      }

      const aiCaption = await AIService.generateCaption({
        title: deal.title,
        originalPrice: deal.originalPrice,
        discountPrice: deal.discountPrice,
        discountPercent: deal.discountPercent,
        platform: deal.platform,
        link: deal.affiliateUrl,
      });

      const updated = await prisma.deal.update({
        where: { id },
        data: { aiCaption },
      });

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateCaption(req: Request, res: Response) {
    const { id } = req.params;
    const { aiCaption } = req.body;

    if (!aiCaption) {
      return res.status(400).json({ error: 'Nội dung caption không được trống' });
    }

    try {
      const updated = await prisma.deal.update({
        where: { id },
        data: { aiCaption },
      });
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async triggerScan(req: Request, res: Response) {
    try {
      // Async trigger to not block HTTP response
      DealFinderService.searchAndPostDeals()
        .then(() => console.log('Manual deal scan completed.'))
        .catch((err) => console.error('Manual deal scan error:', err));

      res.json({ message: 'Đã kích hoạt quét deal thành công. Vui lòng đợi trong giây lát để hệ thống tìm kiếm.' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async manualSearch(req: Request, res: Response) {
    const { keyword, maxPrice } = req.body;
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ error: 'Từ khóa tìm kiếm không được trống' });
    }

    try {
      const parsedMaxPrice = maxPrice ? parseFloat(maxPrice) : undefined;
      const results = await DealFinderService.manualSearch(keyword.trim(), parsedMaxPrice);
      res.json({
        message: `Đã tìm kiếm thủ công thành công cho từ khóa: ${keyword}`,
        dealsFound: results.length,
        data: results
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
