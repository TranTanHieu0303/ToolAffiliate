import { GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from './config.service';

export class AIService {
  static async generateCaption(product: {
    title: string;
    originalPrice: number;
    discountPrice: number;
    discountMargin: number;
    platform: string;
    link: string;
    canUseCoins?: boolean;
    maxCoinsRedeem?: number;
    shopVoucher?: number;
    platformVoucher?: number;
    priceAfterCoins?: number;
  }): Promise<string> {
    const config = await ConfigService.getConfig();
    const apiKey = config.geminiApiKey;

    if (!apiKey) {
      console.warn('Gemini API key is not configured. Falling back to default caption.');
      return this.getDefaultCaption(product);
    }

    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const modelsToTry = [
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-2.5-pro'
      ];

      let promptTemplate = config.promptTemplate || '';
      const prompt = promptTemplate
        .replace(/{title}/g, product.title)
        .replace(/{originalPrice}/g, product.originalPrice.toLocaleString('vi-VN'))
        .replace(/{discountPrice}/g, product.discountPrice.toLocaleString('vi-VN'))
        .replace(/{discountMargin}/g, product.discountMargin.toString())
        .replace(/{platform}/g, product.platform)
        .replace(/{link}/g, product.link)
        .replace(/{canUseCoins}/g, product.canUseCoins ? 'Có áp xu' : 'Không áp xu')
        .replace(/{maxCoinsRedeem}/g, (product.maxCoinsRedeem || 0).toLocaleString('vi-VN'))
        .replace(/{shopVoucher}/g, (product.shopVoucher || 0).toLocaleString('vi-VN'))
        .replace(/{platformVoucher}/g, (product.platformVoucher || 0).toLocaleString('vi-VN'))
        .replace(/{priceAfterCoins}/g, (product.priceAfterCoins || product.discountPrice).toLocaleString('vi-VN'));

      for (const modelName of modelsToTry) {
        try {
          console.log(`[AI Service] Attempting caption generation using model: ${modelName}...`);
          const model = genAI.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(prompt);
          const response = await result.response;
          const text = response.text().trim();
          if (text) {
            console.log(`[AI Service] Successfully generated caption using model: ${modelName}`);
            return text;
          }
        } catch (modelError: any) {
          console.warn(`[AI Service] Model ${modelName} failed. Error: ${modelError.message || modelError}`);
        }
      }

      console.warn('All Gemini models failed. Falling back to default caption.');
      return this.getDefaultCaption(product);
    } catch (error) {
      console.error('General error during caption generation setup:', error);
      return this.getDefaultCaption(product);
    }
  }

  private static getDefaultCaption(product: {
    title: string;
    originalPrice: number;
    discountPrice: number;
    discountMargin: number;
    platform: string;
    link: string;
    canUseCoins?: boolean;
    maxCoinsRedeem?: number;
    shopVoucher?: number;
    platformVoucher?: number;
    priceAfterCoins?: number;
  }): string {

    let caption = `🔥 DEAL HOT TRÊN ${product.platform.toUpperCase()} 🔥\n\n` +
      `📦 Sản phẩm: ${product.title}\n` +
      `❌ Giá gốc: ${product.originalPrice.toLocaleString('vi-VN')}đ\n` +
      `✅ Giá giảm: ${product.discountPrice.toLocaleString('vi-VN')}đ (-${product.discountMargin}%)\n`;

    if (product.shopVoucher && product.shopVoucher > 0) {
      caption += `🎟️ Voucher Shop: -${product.shopVoucher.toLocaleString('vi-VN')}đ\n`;
    }
    if (product.platformVoucher && product.platformVoucher > 0) {
      caption += `🎟️ Voucher Sàn: -${product.platformVoucher.toLocaleString('vi-VN')}đ\n`;
    }
    if (product.canUseCoins && product.maxCoinsRedeem && product.maxCoinsRedeem > 0) {
      caption += `🪙 Áp xu: Lên tới -${product.maxCoinsRedeem.toLocaleString('vi-VN')}đ (Chỉ áp dụng trên App)\n`;
    }
    if (product.priceAfterCoins) {
      caption += `💥 Giá cuối ước tính qua App: ${product.priceAfterCoins.toLocaleString('vi-VN')}đ\n`;
    }

    caption += `\n(*) Mở link trên App điện thoại để tự động áp dụng đầy đủ voucher & xu tốt nhất.\n\n` +
      `👉 Mua ngay tại đây: ${product.link}\n` +
      `#affiliate #${product.platform.toLowerCase()}`;

    return caption;
  }
}
