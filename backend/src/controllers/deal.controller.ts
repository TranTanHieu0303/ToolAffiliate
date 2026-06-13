import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { AIService } from '../services/ai.service';
import { TelegramService } from '../services/telegram.service';
import { DealFinderService } from '../services/deal-finder.service';
import { ConfigService } from '../services/config.service';
import { FacebookService } from '../services/facebook.service';
import axios from 'axios';

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
        discountMargin: deal.discountMargin || 0,
        platform: deal.platform,
        link: deal.affiliateUrl || deal.originalUrl,
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

  static async parseLink(req: Request, res: Response) {
    const { url, isShortLink } = req.body;
    if (!url || !url.trim()) {
      return res.status(400).json({ error: 'Đường dẫn sản phẩm không được trống' });
    }

    try {
      let resolvedUrl = url.trim();
      const isShort = isShortLink || /s\.lazada\.vn|shope\.ee|shp\.ee|shopee\.vn\/universal-link/.test(resolvedUrl);

      if (isShort) {
        try {
          console.log(`[Parse Link] Resolving short link: ${resolvedUrl}`);
          let currentUrl = resolvedUrl;
          const maxDepth = 8;
          let depth = 0;

          while (depth < maxDepth) {
            console.log(`[Parse Link] Redirect Step ${depth}: ${currentUrl}`);
            const response = await axios.get(currentUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              },
              maxRedirects: 0,
              validateStatus: (status) => status >= 200 && status < 400,
              timeout: 6000,
            });

            if (response.status >= 300 && response.status < 400 && response.headers.location) {
              let redirectUrl = response.headers.location;
              if (!redirectUrl.startsWith('http')) {
                const urlObj = new URL(currentUrl);
                redirectUrl = urlObj.origin + (redirectUrl.startsWith('/') ? '' : '/') + redirectUrl;
              }
              currentUrl = redirectUrl;
              depth++;
            } else {
              if ((response.request as any)?.res?.responseUrl) {
                currentUrl = (response.request as any).res.responseUrl;
              }
              break;
            }
          }
          resolvedUrl = currentUrl;
          console.log(`[Parse Link] Final resolved URL: ${resolvedUrl}`);
        } catch (err: any) {
          if (err.response && err.response.status >= 300 && err.response.status < 400 && err.response.headers.location) {
            let redirectUrl = err.response.headers.location;
            if (!redirectUrl.startsWith('http')) {
              const urlObj = new URL(resolvedUrl);
              redirectUrl = urlObj.origin + (redirectUrl.startsWith('/') ? '' : '/') + redirectUrl;
            }
            resolvedUrl = redirectUrl;
            console.log(`[Parse Link] Final resolved URL from catch: ${resolvedUrl}`);
          } else {
            console.error('[Parse Link] Error resolving redirect, using original:', err.message);
          }
        }
      }

      // Determine platform
      let platform = 'SHOPEE';
      if (resolvedUrl.includes('lazada.vn')) {
        platform = 'LAZADA';
      } else if (resolvedUrl.includes('shopee.vn')) {
        platform = 'SHOPEE';
      }

      // Extract productId if possible
      let productId = '';
      if (platform === 'SHOPEE') {
        const match = resolvedUrl.match(/i\.(\d+)\.(\d+)/) || resolvedUrl.match(/product\/(\d+)\/(\d+)/);
        if (match) {
          productId = match[2];
        }
      } else {
        const match = resolvedUrl.match(/i(\d+)-s(\d+)\.html|i(\d+)\.html/);
        if (match) {
          productId = match[1] || match[3];
        }
      }

      if (!productId) {
        productId = `manual-${Date.now()}`;
      }

      let title = '';
      let originalPrice = 0;
      let discountPrice = 0;
      let imageUrl = '';
      let shopVoucher = 0;
      let platformVoucher = 0;
      let canUseCoins = false;
      let maxCoinsRedeem = 0;

      // Call anonymous fast HTML parser instead of Puppeteer/cookie
      try {
        console.log(`[Parse Link] Fetching basic details anonymously for: ${resolvedUrl}`);
        const response = await axios.get(resolvedUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
          },
          timeout: 8000,
          validateStatus: () => true
        });

        const html: string = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

        if (platform === 'SHOPEE') {
          // ---- SHOPEE: Extract from window.__INITIAL_STATE__ ----
          // Use balanced-brace extraction to safely parse the full JSON blob
          const startIdx = html.indexOf('window.__INITIAL_STATE__=');
          if (startIdx !== -1) {
            const startBrace = html.indexOf('{', startIdx);
            if (startBrace !== -1) {
              let depth = 0, end = 0;
              for (let i = startBrace; i < html.length; i++) {
                if (html[i] === '{') depth++;
                else if (html[i] === '}') {
                  depth--;
                  if (depth === 0) { end = i + 1; break; }
                }
              }
              if (end > startBrace) {
                try {
                  const stateObj = JSON.parse(html.substring(startBrace, end));
                  const item = stateObj.item || stateObj.productDetail?.product;
                  if (item) {
                    if (item.name) title = item.name;
                    const rawPrice = item.price || item.price_min || 0;
                    const rawOrigPrice = item.price_before_discount || item.price_max || rawPrice;
                    discountPrice = rawPrice / 100000;
                    originalPrice = rawOrigPrice / 100000;
                    if (item.image) {
                      imageUrl = `https://down-vn.img.susercontent.com/file/${item.image}`;
                    } else if (item.images && item.images[0]) {
                      imageUrl = `https://down-vn.img.susercontent.com/file/${item.images[0]}`;
                    }
                  }
                } catch (e) {
                  console.warn('[Parse Link] Shopee INITIAL_STATE parse failed:', (e as Error).message);
                }
              }
            }
          }

        } else if (platform === 'LAZADA') {
          // ---- LAZADA: Extract from window.__moduleData__ (SSR data) ----
          // Lazada renders product metadata (title, images, skuIds) in SSR HTML.
          // Prices are NOT in SSR — must be fetched separately via Mtop API.

          let lazFields: any = null;
          let defaultSkuId = '';
          let itemId = productId;

          // Step 1: Find __moduleData__ using balanced-brace algorithm
          const moduleDataMarker = '__moduleData__ = ';
          const markerIdx = html.indexOf(moduleDataMarker);
          if (markerIdx !== -1) {
            const startBrace = html.indexOf('{', markerIdx);
            if (startBrace !== -1) {
              let depth = 0, end = 0;
              for (let i = startBrace; i < html.length; i++) {
                if (html[i] === '{') depth++;
                else if (html[i] === '}') {
                  depth--;
                  if (depth === 0) { end = i + 1; break; }
                }
              }
              if (end > startBrace) {
                try {
                  const moduleData = JSON.parse(html.substring(startBrace, end));
                  lazFields = moduleData?.data?.root?.fields;

                  if (lazFields) {
                    // Title: at fields.product.title (NOT fields.product.fields.title)
                    title = lazFields.product?.title || lazFields.product?.name || '';
                    console.log(`[Parse Link] Lazada SSR title: "${title}"`);

                    // Default SKU and item IDs from primaryKey
                    defaultSkuId = lazFields.primaryKey?.defaultSkuId || lazFields.primaryKey?.skuId || '';
                    itemId = lazFields.primaryKey?.itemId || productId;

                    // Images: from skuGalleries keyed by skuId or "0"
                    const galleries = lazFields.skuGalleries || {};
                    // Try default SKU first, then key "0", then first available
                    const gallerySku = galleries[defaultSkuId] || galleries['0'] || Object.values(galleries)[0] as any[];
                    if (gallerySku && Array.isArray(gallerySku)) {
                      for (const item of gallerySku) {
                        if (item.src || item.poster) {
                          let img: string = item.src || item.poster;
                          if (img.startsWith('//')) img = `https:${img}`;
                          imageUrl = img;
                          break;
                        }
                      }
                    }
                    // Fallback: get image from skuInfos
                    if (!imageUrl) {
                      const skuInfos = lazFields.skuInfos || {};
                      const firstSku = skuInfos[defaultSkuId] || Object.values(skuInfos)[0] as any;
                      if (firstSku?.image) {
                        imageUrl = firstSku.image.startsWith('//') ? `https:${firstSku.image}` : firstSku.image;
                      }
                    }
                  }
                } catch (e) {
                  console.warn('[Parse Link] Lazada __moduleData__ parse failed:', (e as Error).message);
                }
              }
            }
          }

          // Step 2: Lazada prices are loaded client-side via Mtop API (requires auth).
          // Anonymous scraping cannot retrieve actual prices.
          // We try LD+JSON first (usually doesn't have price for Lazada), then give up gracefully.
          if (itemId) {
            const ldJsonRegex = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
            let ldMatch;
            while ((ldMatch = ldJsonRegex.exec(html)) !== null) {
              try {
                const parsed = JSON.parse(ldMatch[1].trim());
                if (parsed?.['@type'] === 'Product') {
                  if (parsed.name && !title) title = parsed.name;
                  if (parsed.image && !imageUrl) {
                    imageUrl = Array.isArray(parsed.image) ? parsed.image[0] : parsed.image;
                  }
                  const offer = parsed.offers;
                  if (offer) {
                    const o = Array.isArray(offer) ? offer[0] : offer;
                    const priceVal = parseFloat(o?.price || o?.lowPrice || '0');
                    if (priceVal > 0) {
                      discountPrice = priceVal;
                      originalPrice = priceVal;
                    }
                  }
                  break;
                }
              } catch (e) { }
            }

            if (!discountPrice) {
              console.log(`[Parse Link] Lazada price not available via anonymous scraping (loaded client-side). User must enter manually.`);
            }
          }
        }

        // ---- Common Fallbacks (OG Meta / Title tag) ----
        if (!title) {
          // og:title first, then <title>
          const ogTitle = html.match(/property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
            || html.match(/content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
          const titleTag = html.match(/<title>([^<]+)<\/title>/i);
          const raw = ogTitle?.[1] || titleTag?.[1] || '';
          // Strip " | Lazada Việt Nam" suffix from og:title
          title = raw.replace(/\s*\|\s*Lazada\s+.*$/i, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
        }

        if (!imageUrl) {
          const imgMatch = html.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
            || html.match(/content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
          if (imgMatch) imageUrl = imgMatch[1];
        }

      } catch (scrapeErr: any) {
        console.error('[Parse Link] Anonymous scrape failed, fallback to empty:', scrapeErr.message);
      }

      // If Lazada (since prices are loaded client-side via Mtop API) or if Shopee static parse failed,
      // fallback to anonymous browser scraping to let client scripts execute and get the full details.
      if (platform === 'LAZADA' || !title || !discountPrice) {
        try {
          console.log(`[Parse Link] Fallback to anonymous browser scrape for ${platform} to execute client scripts...`);
          const browserData = await DealFinderService.fetchProductDetailsViaBrowser(resolvedUrl, platform);
          if (browserData) {
            if (browserData.title) title = browserData.title;
            if (browserData.discountPrice) discountPrice = browserData.discountPrice;
            if (browserData.originalPrice) originalPrice = browserData.originalPrice;
            if (browserData.shopVoucher) shopVoucher = browserData.shopVoucher;
            if (browserData.platformVoucher) platformVoucher = browserData.platformVoucher;
            if (browserData.canUseCoins !== undefined) canUseCoins = browserData.canUseCoins;
            if (browserData.maxCoinsRedeem) maxCoinsRedeem = browserData.maxCoinsRedeem;
          }
        } catch (browserErr: any) {
          console.warn('[Parse Link] Fallback browser scrape failed:', browserErr.message);
        }
      }

      res.json({
        platform,
        productId,
        resolvedUrl,
        title,
        originalPrice,
        discountPrice,
        imageUrl,
        shopVoucher,
        platformVoucher,
        canUseCoins,
        maxCoinsRedeem,
        priceRequired: platform === 'LAZADA' && discountPrice === 0,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async createManualDeal(req: Request, res: Response) {
    const {
      platform,
      originalUrl,
      title,
      originalPrice,
      discountAmount,
      coinAmount,
      finalPrice,
      imageUrl,
    } = req.body;

    if (!originalUrl || !title || originalPrice === undefined || finalPrice === undefined) {
      return res.status(400).json({ error: 'Thiếu thông tin bắt buộc để tạo deal' });
    }

    try {
      const config = await ConfigService.getConfig();

      // Generate affiliate link
      const affiliateUrl = await DealFinderService.generateAffiliateLink(
        originalUrl.trim(),
        platform,
        config
      );

      // Determine product ID
      let productId = '';
      if (platform === 'SHOPEE') {
        const match = originalUrl.match(/i\.(\d+)\.(\d+)/) || originalUrl.match(/product\/(\d+)\/(\d+)/);
        if (match) {
          productId = match[2];
        }
      } else {
        const match = originalUrl.match(/i(\d+)-s(\d+)\.html|i(\d+)\.html/);
        if (match) {
          productId = match[1] || match[3];
        }
      }

      if (!productId) {
        productId = `manual-${Date.now()}`;
      }

      // Calculations for AI prompt & DB
      const parsedOriginalPrice = parseFloat(originalPrice) || 0;
      const parsedDiscountAmount = parseFloat(discountAmount) || 0;
      const parsedCoinAmount = parseFloat(coinAmount) || 0;
      const parsedFinalPrice = parseFloat(finalPrice) || 0;

      const discountPrice = parsedOriginalPrice - parsedDiscountAmount;
      const discountMargin = Math.round(((parsedOriginalPrice - parsedFinalPrice) / (parsedOriginalPrice || 1)) * 100);

      // Save to database
      const dealData = {
        platform,
        productId,
        title,
        imageUrl: imageUrl || null,
        originalPrice: parsedOriginalPrice,
        discountPrice: discountPrice,
        discountMargin: discountMargin,
        originalUrl: originalUrl.trim(),
        affiliateUrl,
        status: 'PENDING',
        canUseCoins: parsedCoinAmount > 0,
        maxCoinsRedeem: parsedCoinAmount,
        shopVoucher: parsedDiscountAmount,
        platformVoucher: 0,
        priceAfterCoins: parsedFinalPrice,
      };

      // Generate AI Caption using the computed fields
      const aiCaption = await AIService.generateCaption({
        title: dealData.title,
        originalPrice: dealData.originalPrice,
        discountPrice: dealData.discountPrice,
        discountMargin: dealData.discountMargin,
        platform: dealData.platform,
        link: dealData.affiliateUrl,
        canUseCoins: dealData.canUseCoins,
        maxCoinsRedeem: dealData.maxCoinsRedeem,
        shopVoucher: dealData.shopVoucher,
        platformVoucher: dealData.platformVoucher,
        priceAfterCoins: dealData.priceAfterCoins,
      });

      // Upsert Deal in DB
      const savedDeal = await prisma.deal.upsert({
        where: {
          platform_productId: {
            platform,
            productId,
          },
        },
        update: {
          title: dealData.title,
          imageUrl: dealData.imageUrl,
          originalPrice: dealData.originalPrice,
          discountPrice: dealData.discountPrice,
          discountMargin: dealData.discountMargin,
          originalUrl: dealData.originalUrl,
          affiliateUrl: dealData.affiliateUrl,
          canUseCoins: dealData.canUseCoins,
          maxCoinsRedeem: dealData.maxCoinsRedeem,
          shopVoucher: dealData.shopVoucher,
          platformVoucher: dealData.platformVoucher,
          priceAfterCoins: dealData.priceAfterCoins,
          aiCaption,
          updatedAt: new Date(),
        },
        create: {
          ...dealData,
          aiCaption,
        },
      });

      res.json(savedDeal);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async sendToFacebook(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const deal = await prisma.deal.findUnique({ where: { id } });
      if (!deal) {
        return res.status(404).json({ error: 'Không tìm thấy deal' });
      }

      if (!deal.aiCaption) {
        return res.status(400).json({ error: 'Deal này chưa có caption' });
      }

      const sent = await FacebookService.postToPage(deal.aiCaption, deal.imageUrl || undefined);

      if (sent) {
        res.json({ message: 'Đã đăng thành công lên Fanpage Facebook!' });
      } else {
        res.status(500).json({ error: 'Không thể đăng lên Facebook Page. Vui lòng kiểm tra lại cấu hình Page ID & Access Token.' });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
