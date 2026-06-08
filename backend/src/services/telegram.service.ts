import axios from 'axios';
import { ConfigService } from './config.service';

export class TelegramService {
  static async sendMessage(caption: string, imageUrl?: string): Promise<boolean> {
    const config = await ConfigService.getConfig();
    const token = config.telegramBotToken;
    const chatId = config.telegramChatId;

    if (!token || !chatId) {
      console.warn('Telegram token or chat ID is missing. Message not sent.');
      return false;
    }

    try {
      if (imageUrl) {
        // Send Photo
        const url = `https://api.telegram.org/bot${token}/sendPhoto`;
        await axios.post(url, {
          chat_id: chatId,
          photo: imageUrl,
          caption: caption,
          parse_mode: 'Markdown',
        });
      } else {
        // Send Message
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        await axios.post(url, {
          chat_id: chatId,
          text: caption,
          parse_mode: 'Markdown',
        });
      }
      return true;
    } catch (error: any) {
      console.log('Telegram Markdown parse failed, retrying with raw text fallback...');
      // Fallback without parse_mode if Markdown fails due to syntax
      try {
        if (imageUrl) {
          const url = `https://api.telegram.org/bot${token}/sendPhoto`;
          await axios.post(url, {
            chat_id: chatId,
            photo: imageUrl,
            caption: caption,
          });
        } else {
          const url = `https://api.telegram.org/bot${token}/sendMessage`;
          await axios.post(url, {
            chat_id: chatId,
            text: caption,
          });
        }
        return true;
      } catch (fallbackError: any) {
        console.error('Fallback Telegram send failed:', fallbackError?.response?.data || fallbackError.message);
        return false;
      }
    }
  }
}
