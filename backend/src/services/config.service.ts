import { prisma } from './prisma.service';


const DEFAULT_PROMPT = `Bạn là một chuyên gia viết content affiliate marketing.
Nhiệm vụ của bạn là viết một bài đăng (caption) cực kỳ hấp dẫn để chia sẻ deal hời này lên mạng xã hội (Telegram, Zalo, Messenger).

Thông tin sản phẩm:
- Tên sản phẩm: {title}
- Giá gốc: {originalPrice}đ
- Giá giảm: {discountPrice}đ (-{discountPercent}%)
- Mã giảm Shop: {shopVoucher}đ
- Mã giảm Sàn: {platformVoucher}đ
- Áp xu: {maxCoinsRedeem}đ (Lưu ý: Chỉ áp dụng tối đa khi mua trên App điện thoại)
- Giá cuối ước tính qua App: {priceAfterCoins}đ
- Sàn: {platform}

Yêu cầu bài viết:
1. Sử dụng các emoji sinh động, thu hút chú ý.
2. Nêu bật mức giảm giá/ưu đãi và Giá cuối qua App.
3. Có chú thích nhỏ ở cuối bài viết: (*) Mở link trên App điện thoại để tự động áp dụng đầy đủ voucher & xu.
4. Có lời kêu gọi hành động (CTA) rõ ràng ở cuối kèm link: {link}
5. Bài viết ngắn gọn, dễ đọc, khoảng 3-5 dòng, tập trung vào lợi ích sản phẩm hoặc mức độ hời của deal.
6. Ngôn ngữ tiếng Việt, tự nhiên, thân thiện.`;

export class ConfigService {
  static async getConfig() {
    let config = await prisma.systemConfig.findUnique({
      where: { id: 'default' },
    });

    if (!config) {
      config = await prisma.systemConfig.create({
        data: {
          id: 'default',
          telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
          telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
          geminiApiKey: process.env.GEMINI_API_KEY || '',
          promptTemplate: DEFAULT_PROMPT,
        },
      });
    } else if (!config.promptTemplate.includes('để tự động áp dụng đầy đủ voucher & xu')) {
      // Force revert/upgrade the prompt template to the new one with app notice
      config = await prisma.systemConfig.update({
        where: { id: 'default' },
        data: {
          promptTemplate: DEFAULT_PROMPT,
        },
      });
      console.log('Successfully upgraded prompt template with mobile app instructions in the database.');
    }

    return config;
  }

  static async updateConfig(data: any) {
    return prisma.systemConfig.upsert({
      where: { id: 'default' },
      update: {
        telegramBotToken: data.telegramBotToken,
        telegramChatId: data.telegramChatId,
        geminiApiKey: data.geminiApiKey,
        shopeeVietnamAppId: data.shopeeVietnamAppId,
        shopeeVietnamAppSecret: data.shopeeVietnamAppSecret,
        lazadaAppKey: data.lazadaAppKey,
        lazadaAppSecret: data.lazadaAppSecret,
        searchIntervalMinutes: Number(data.searchIntervalMinutes || 60),
        isScannerActive: data.isScannerActive !== undefined ? Boolean(data.isScannerActive) : true,
        isAutoSendTelegram: data.isAutoSendTelegram !== undefined ? Boolean(data.isAutoSendTelegram) : true,
        shopeeAffiliateId: data.shopeeAffiliateId || '',
        lazadaAffiliateId: data.lazadaAffiliateId || '',
        accessTradeId: data.accessTradeId || '',
        shopeeCookie: data.shopeeCookie || '',
        lazadaCookie: data.lazadaCookie || '',
        scrapeMethod: data.scrapeMethod || 'api',
        lazadaSearchMethod: data.lazadaSearchMethod || 'catalog',
        adsenseLinkConvert: data.adsenseLinkConvert !== undefined ? Boolean(data.adsenseLinkConvert) : undefined,
        promptTemplate: data.promptTemplate,
      },
      create: {
        id: 'default',
        telegramBotToken: data.telegramBotToken,
        telegramChatId: data.telegramChatId,
        geminiApiKey: data.geminiApiKey,
        shopeeVietnamAppId: data.shopeeVietnamAppId,
        shopeeVietnamAppSecret: data.shopeeVietnamAppSecret,
        lazadaAppKey: data.lazadaAppKey,
        lazadaAppSecret: data.lazadaAppSecret,
        searchIntervalMinutes: Number(data.searchIntervalMinutes || 60),
        isScannerActive: data.isScannerActive !== undefined ? Boolean(data.isScannerActive) : true,
        isAutoSendTelegram: data.isAutoSendTelegram !== undefined ? Boolean(data.isAutoSendTelegram) : true,
        shopeeAffiliateId: data.shopeeAffiliateId || '',
        lazadaAffiliateId: data.lazadaAffiliateId || '',
        accessTradeId: data.accessTradeId || '',
        shopeeCookie: data.shopeeCookie || '',
        lazadaCookie: data.lazadaCookie || '',
        scrapeMethod: data.scrapeMethod || 'api',
        lazadaSearchMethod: data.lazadaSearchMethod || 'catalog',
        adsenseLinkConvert: data.adsenseLinkConvert !== undefined ? Boolean(data.adsenseLinkConvert) : false,
        promptTemplate: data.promptTemplate || DEFAULT_PROMPT,
      },
    });
  }
}
