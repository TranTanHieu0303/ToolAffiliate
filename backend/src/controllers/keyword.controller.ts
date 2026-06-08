import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';

export class KeywordController {
  static async getKeywords(req: Request, res: Response) {
    try {
      const keywords = await prisma.searchKeyword.findMany({
        orderBy: { createdAt: 'desc' },
      });
      res.json(keywords);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async addKeyword(req: Request, res: Response) {
    const { keyword, maxPrice } = req.body;
    if (!keyword || typeof keyword !== 'string') {
      return res.status(400).json({ error: 'Từ khóa không hợp lệ' });
    }

    try {
      const cleanKeyword = keyword.trim().toLowerCase();
      
      const existing = await prisma.searchKeyword.findUnique({
        where: { keyword: cleanKeyword },
      });

      if (existing) {
        return res.status(400).json({ error: 'Từ khóa đã tồn tại' });
      }

      const parsedMaxPrice = maxPrice ? parseFloat(maxPrice) : null;

      const kw = await prisma.searchKeyword.create({
        data: { 
          keyword: cleanKeyword,
          maxPrice: parsedMaxPrice,
        },
      });
      res.status(201).json(kw);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async toggleKeyword(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const existing = await prisma.searchKeyword.findUnique({
        where: { id: Number(id) },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Không tìm thấy từ khóa' });
      }

      const updated = await prisma.searchKeyword.update({
        where: { id: Number(id) },
        data: { isActive: !existing.isActive },
      });

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async deleteKeyword(req: Request, res: Response) {
    const { id } = req.params;
    try {
      await prisma.searchKeyword.delete({
        where: { id: Number(id) },
      });
      res.json({ message: 'Đã xóa từ khóa thành công!' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
