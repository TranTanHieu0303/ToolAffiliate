import { Router } from 'express';
import { ConfigController } from '../controllers/config.controller';
import { KeywordController } from '../controllers/keyword.controller';
import { DealController } from '../controllers/deal.controller';
import { OrderController } from '../controllers/order.controller';

const router = Router();

// Cấu hình hệ thống (System Configuration)
router.get('/config', ConfigController.getConfig);
router.post('/config', ConfigController.updateConfig);

// Quản lý từ khóa (Keyword Management)
router.get('/keywords', KeywordController.getKeywords);
router.post('/keywords', KeywordController.addKeyword);
router.put('/keywords/:id/toggle', KeywordController.toggleKeyword);
router.delete('/keywords/:id', KeywordController.deleteKeyword);

// Quản lý Deal (Deal Management)
router.get('/deals', DealController.getDeals);
router.post('/deals/trigger-scan', DealController.triggerScan);
router.post('/deals/manual-search', DealController.manualSearch);
router.post('/deals/parse-link', DealController.parseLink);
router.post('/deals/create-manual', DealController.createManualDeal);
router.post('/deals/:id/send', DealController.sendToTelegram);
router.post('/deals/:id/send-facebook', DealController.sendToFacebook);
router.post('/deals/:id/regenerate', DealController.regenerateCaption);
router.put('/deals/:id/caption', DealController.updateCaption);

// Đơn hàng & Thống kê (Orders & Statistics)
router.get('/orders', OrderController.getOrders);
router.post('/orders/generate-mock', OrderController.generateMockOrders);
router.get('/dashboard/stats', OrderController.getDashboardStats);

export default router;
