import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';

export class OrderController {
  static async getOrders(req: Request, res: Response) {
    try {
      const orders = await prisma.order.findMany({
        orderBy: { purchaseTime: 'desc' },
      });
      res.json(orders);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getDashboardStats(req: Request, res: Response) {
    try {
      const totalOrders = await prisma.order.count();
      const revenueAggregate = await prisma.order.aggregate({
        _sum: {
          orderValue: true,
          commission: true,
        },
      });

      const totalRevenue = revenueAggregate._sum.orderValue || 0;
      const totalCommission = revenueAggregate._sum.commission || 0;

      const dealsSentCount = await prisma.deal.count({
        where: { status: 'SENT' },
      });

      const recentOrders = await prisma.order.findMany({
        orderBy: { purchaseTime: 'desc' },
        take: 5,
      });

      const recentDeals = await prisma.deal.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      // Get monthly commission chart data for last 6 months
      // Since SQLite doesn't have advanced date functions, we fetch all orders and group in memory
      const allOrders = await prisma.order.findMany({
        orderBy: { purchaseTime: 'asc' },
      });

      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthlyDataMap: { [key: string]: { commission: number; count: number } } = {};

      // Initialize last 6 months
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = `${months[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`;
        monthlyDataMap[label] = { commission: 0, count: 0 };
      }

      allOrders.forEach((order: any) => {
        const date = new Date(order.purchaseTime);
        const label = `${months[date.getMonth()]} ${date.getFullYear().toString().substring(2)}`;
        if (monthlyDataMap[label]) {
          monthlyDataMap[label].commission += order.commission;
          monthlyDataMap[label].count += 1;
        }
      });

      const chartLabels = Object.keys(monthlyDataMap);
      const chartCommissionData = chartLabels.map((l) => Math.round(monthlyDataMap[l].commission));
      const chartOrderCountData = chartLabels.map((l) => monthlyDataMap[l].count);

      res.json({
        totalOrders,
        totalRevenue,
        totalCommission,
        dealsSentCount,
        recentOrders,
        recentDeals,
        chart: {
          labels: chartLabels,
          commission: chartCommissionData,
          orders: chartOrderCountData,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async generateMockOrders(req: Request, res: Response) {
    try {
      const count = await prisma.order.count();
      if (count > 0) {
        return res.json({ message: 'Đã có đơn hàng trong hệ thống, không cần tạo mock!' });
      }

      const mockProducts = [
        'Nồi chiên không dầu Lock&Lock 5.2L',
        'Tai nghe Bluetooth chụp tai Sony WH-1000XM4',
        'Cáp sạc nhanh Anker PowerLine III USB-C to Lightning',
        'Chuột không dây Logitech MX Master 3S',
        'Bàn phím cơ Keychron K2 Pro',
        'Son kem lì 3CE Velvet Lip Tint',
        'Sữa rửa mặt Cetaphil Gentle Skin Cleanser 500ml',
        'Máy lọc không khí Xiaomi Smart Air Purifier 4',
        'Sách: Đắc Nhân Tâm (Khổ Lớn Mới)',
        'Đế sạc không dây 3 trong 1 Baseus',
      ];

      const platforms = ['SHOPEE', 'LAZADA'];
      const statuses = ['COMPLETED', 'PENDING', 'CANCELLED'];
      const now = new Date();

      const ordersToCreate = [];

      for (let i = 0; i < 45; i++) {
        const orderId = 'ORD' + Math.floor(Math.random() * 900000000 + 100000000).toString();
        const platform = platforms[Math.floor(Math.random() * platforms.length)];
        const productName = mockProducts[Math.floor(Math.random() * mockProducts.length)];
        const orderValue = Math.floor(Math.random() * 1500 + 50) * 1000; // 50k - 1.5M
        const commission = Math.round(orderValue * (Math.random() * 0.08 + 0.02)); // 2% - 10%
        const status = statuses[Math.floor(Math.random() * 0.85 + 0.15)]; // Higher chance of COMPLETED/PENDING
        
        // Random date in the last 6 months
        const purchaseTime = new Date(
          now.getFullYear(),
          now.getMonth() - Math.floor(Math.random() * 6),
          Math.floor(Math.random() * 28) + 1,
          Math.floor(Math.random() * 24),
          Math.floor(Math.random() * 60)
        );

        ordersToCreate.push({
          id: orderId,
          platform,
          productName,
          orderValue,
          commission,
          status,
          purchaseTime,
        });
      }

      await prisma.order.createMany({
        data: ordersToCreate,
      });

      res.status(201).json({ message: `Đã tạo thành công 45 đơn hàng giả lập để thử nghiệm thống kê!` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
