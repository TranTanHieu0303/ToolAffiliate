import axios from 'axios';
import { ConfigService } from './config.service';

export class FacebookService {
  static async postToPage(message: string, imageUrl?: string): Promise<boolean> {
    const config = await ConfigService.getConfig();
    
    // Read from DB config or fallback to env variables
    const pageId = (config as any).facebookPageId || process.env.FACEBOOK_PAGE_ID;
    const accessToken = (config as any).facebookPageAccessToken || process.env.FACEBOOK_PAGE_ACCESS_TOKEN;

    if (!pageId || !accessToken) {
      console.warn('[Facebook Service] Facebook Page ID or Access Token is not configured. Skipping post.');
      return false;
    }

    try {
      let url = `https://graph.facebook.com/v19.0/${pageId}/feed`;
      const params: any = {
        message,
        access_token: accessToken,
      };

      if (imageUrl && imageUrl.startsWith('http')) {
        // If there is an image, we post a photo to the page
        url = `https://graph.facebook.com/v19.0/${pageId}/photos`;
        params.url = imageUrl;
        params.caption = message;
      }

      console.log(`[Facebook Service] Posting to Page ID: ${pageId}...`);
      const response = await axios.post(url, null, { params, timeout: 10000 });
      
      const success = !!(response.data && (response.data.id || response.data.post_id));
      if (success) {
        console.log(`[Facebook Service] Successfully posted to page! Post ID: ${response.data.id || response.data.post_id}`);
      }
      return success;
    } catch (error: any) {
      console.error('[Facebook Service] Graph API Error:', error.response?.data || error.message);
      return false;
    }
  }
}
