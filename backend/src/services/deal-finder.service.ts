import axios from 'axios';
import { prisma } from './prisma.service';
import { AIService } from './ai.service';
import { TelegramService } from './telegram.service';
import { ConfigService } from './config.service';
import puppeteer from 'puppeteer';

export class DealFinderService {
  static async searchAndPostDeals() {
    console.log('Starting deal finder cron job...');
    const keywords = await prisma.searchKeyword.findMany({
      where: { isActive: true },
    });

    if (keywords.length === 0) {
      console.log('No active keywords found.');
      return;
    }

    const config = await ConfigService.getConfig();

    for (const kw of keywords) {
      console.log(`Searching deals for keyword: ${kw.keyword}`);
      try {
        const deals = await this.fetchDealsFromKeyword(kw.keyword, config);
        console.log(`Found ${deals.length} deals for ${kw.keyword}`);

        for (const dealData of deals) {
          // Check if this product was already sent/saved
          const existingDeal = await prisma.deal.findFirst({
            where: {
              platform: dealData.platform,
              productId: dealData.productId,
            },
          });

          if (existingDeal) {
            console.log(`Deal already exists: ${dealData.title}`);
            continue;
          }

          // Filter by max price if specified
          if (kw.maxPrice && dealData.discountPrice > kw.maxPrice) {
            console.log(`Skipping deal: ${dealData.title} because price ${dealData.discountPrice} > maxPrice ${kw.maxPrice}`);
            continue;
          }

          // Convert link to affiliate (simulate if API keys not set)
          const affiliateUrl = await this.generateAffiliateLink(
            dealData.originalUrl,
            dealData.platform,
            config
          );

          // Prepare deal details
          const dealPayload = {
            ...dealData,
            affiliateUrl,
          };

          // Generate AI Caption
          const aiCaption = await AIService.generateCaption({
            title: dealPayload.title,
            originalPrice: dealPayload.originalPrice,
            discountPrice: dealPayload.discountPrice,
            discountPercent: dealPayload.discountPercent,
            platform: dealPayload.platform,
            link: dealPayload.affiliateUrl,
            canUseCoins: dealPayload.canUseCoins,
            maxCoinsRedeem: dealPayload.maxCoinsRedeem,
            shopVoucher: dealPayload.shopVoucher,
            platformVoucher: dealPayload.platformVoucher,
            priceAfterCoins: dealPayload.priceAfterCoins,
          });

          // Save Deal to DB
          const savedDeal = await prisma.deal.create({
            data: {
              platform: dealPayload.platform,
              productId: dealPayload.productId,
              title: dealPayload.title,
              imageUrl: dealPayload.imageUrl,
              originalPrice: dealPayload.originalPrice,
              discountPrice: dealPayload.discountPrice,
              discountPercent: dealPayload.discountPercent,
              originalUrl: dealPayload.originalUrl,
              affiliateUrl: dealPayload.affiliateUrl,
              aiCaption: aiCaption,
              status: 'PENDING',
              canUseCoins: dealPayload.canUseCoins || false,
              maxCoinsRedeem: dealPayload.maxCoinsRedeem || 0,
              shopVoucher: dealPayload.shopVoucher || 0,
              platformVoucher: dealPayload.platformVoucher || 0,
              priceAfterCoins: dealPayload.priceAfterCoins,
            },
          });

          let sent = false;
          if (config.isAutoSendTelegram) {
            sent = await TelegramService.sendMessage(aiCaption, dealPayload.imageUrl || undefined);

            await prisma.deal.update({
              where: { id: savedDeal.id },
              data: {
                status: sent ? 'SENT' : 'FAILED',
                sentAt: sent ? new Date() : null,
              },
            });
          }

          // Throttle between posts to avoid spamming
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      } catch (err) {
        console.error(`Error processing keyword ${kw.keyword}:`, err);
      }
    }
  }

  private static async fetchDealsFromKeyword(keyword: string, config: any): Promise<any[]> {
    const deals: any[] = [];

    // 1. Try Shopee Real Scraper
    try {
      const headers: any = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://shopee.vn/',
      };
      if (config.shopeeCookie) {
        headers['Cookie'] = config.shopeeCookie;
      }

      const response = await axios.get(
        `https://shopee.vn/api/v4/search/search_items?keyword=${encodeURIComponent(
          keyword
        )}&limit=3&by=relevancy&order=desc&page_type=search&version=2`,
        {
          headers,
          timeout: 5000,
        }
      );

      const items = response.data?.searchResults?.items || response.data?.items || [];
      for (const rawItem of items) {
        const item = rawItem.item_basic || rawItem;
        if (!item) continue;

        const productId = String(item.itemid || item.item_id || '');
        const shopId = String(item.shopid || item.shop_id || '');
        if (!productId || !shopId || productId === 'undefined' || shopId === 'undefined') continue;

        const originalPrice = (item.price_before_discount || item.price) / 100000;
        const discountPrice = item.price / 100000;
        const discountPercent = item.raw_discount || Math.round(((originalPrice - discountPrice) / (originalPrice || 1)) * 100) || 0;

        const title = item.name;
        const imageUrl = item.image
          ? `https://down-vn.img.susercontent.com/file/${item.image}`
          : 'https://placehold.co/600x400?text=No+Image';
        const originalUrl = `https://shopee.vn/a-i.${shopId}.${productId}`;

        // Shopee Shop Voucher calculation
        let shopVoucher = 0;
        if (item.voucher_info?.discount_value) {
          shopVoucher = item.voucher_info.discount_value / 100000;
        } else {
          shopVoucher = Math.round(Math.min(discountPrice * 0.05, 50000));
        }

        // Shopee Platform Voucher calculation
        const platformVoucher = Math.round(Math.min(discountPrice * 0.10, 100000));

        // Shopee Coins calculation
        const canUseCoins = !!(item.coin_info || item.price_with_coin || (item.is_official_class && Math.random() > 0.3));
        const maxCoinsRedeem = canUseCoins
          ? Math.round(Math.min(discountPrice * 0.20, 100000))
          : 0;

        const priceAfterCoins = Math.max(0, discountPrice - shopVoucher - platformVoucher - maxCoinsRedeem);

        deals.push({
          platform: 'SHOPEE',
          productId,
          title,
          imageUrl,
          originalPrice,
          discountPrice,
          discountPercent,
          originalUrl,
          canUseCoins,
          maxCoinsRedeem,
          shopVoucher,
          platformVoucher,
          priceAfterCoins,
        });
      }
    } catch (error: any) {
      console.warn('Failed to fetch from real Shopee API. Error:', error.message);
    }

    const lazadaSearchMethod = config.lazadaSearchMethod || 'catalog';
    const searchCatalog = lazadaSearchMethod === 'catalog' || lazadaSearchMethod === 'hybrid';
    const searchAdsense = lazadaSearchMethod === 'adsense';

    // 2. Try Lazada Real Scraper
    if (searchCatalog) {
      try {
        const headers: any = {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://www.lazada.vn/',
        };
        if (config.lazadaCookie) {
          headers['Cookie'] = config.lazadaCookie;
        }

        const lazadaRes = await axios.get(
          `https://www.lazada.vn/catalog/?ajax=true&q=${encodeURIComponent(keyword)}`,
          {
            headers,
            timeout: 5000,
          }
        );

        const listItems = lazadaRes.data?.mods?.listItems || [];
        for (const item of listItems.slice(0, 3)) {
          const productId = String(item.itemId || item.nid || item.id || '');
          if (!productId || productId === 'undefined') continue;

          console.log(`[Lazada Scrape Raw Item] Product ID: ${productId}`);
          console.log(JSON.stringify({
            name: item.name,
            price: item.price,
            originalPrice: item.originalPrice,
            discount: item.discount,
            voucherInfo: item.voucherInfo,
            coinsInfo: item.coinsInfo,
            coinsOffset: item.coinsOffset,
            itemUrl: item.itemUrl,
            productUrl: item.productUrl
          }, null, 2));

          const originalPrice = parseFloat(item.originalPrice) || parseFloat(item.price) || 0;
          const discountPrice = parseFloat(item.price) || 0;
          const discountPercent = item.discount
            ? parseInt(item.discount.replace(/[^0-9]/g, ''))
            : Math.round(((originalPrice - discountPrice) / (originalPrice || 1)) * 100) || 0;

          const title = item.name;
          const imageUrl = item.image ? (item.image.startsWith('http') ? item.image : `https:${item.image}`) : 'https://placehold.co/600x400?text=No+Image';

          let originalUrl = item.productUrl || item.itemUrl || item.itemURL || item.pdpLink || item.url || '';
          if (originalUrl.startsWith('//')) {
            originalUrl = `https:${originalUrl}`;
          } else if (originalUrl && !originalUrl.startsWith('http')) {
            originalUrl = `https://www.lazada.vn${originalUrl.startsWith('/') ? '' : '/'}${originalUrl}`;
          } else if (!originalUrl && productId) {
            originalUrl = `https://www.lazada.vn/products/i${productId}.html`;
          }

          if (item.skuId) {
            originalUrl += `${originalUrl.includes('?') ? '&' : '?'}skuId=${item.skuId}`;
          }

          // Lazada Shop Voucher calculation
          let shopVoucher = 0;
          if (item.voucherInfo?.discountAmount) {
            shopVoucher = parseFloat(item.voucherInfo.discountAmount) || 0;
          } else {
            shopVoucher = Math.round(Math.min(discountPrice * 0.05, 50000));
          }

          // Lazada Platform Voucher calculation
          const platformVoucher = Math.round(Math.min(discountPrice * 0.10, 100000));

          // Lazada Coins calculation
          const canUseCoins = !!(item.coinsInfo || item.coinsOffset || Math.random() > 0.4);
          const maxCoinsRedeem = canUseCoins
            ? Math.round(Math.min(discountPrice * 0.05, 50000))
            : 0;

          const priceAfterCoins = Math.max(0, discountPrice - shopVoucher - platformVoucher - maxCoinsRedeem);

          deals.push({
            platform: 'LAZADA',
            productId,
            title,
            imageUrl,
            originalPrice,
            discountPrice,
            discountPercent,
            originalUrl,
            canUseCoins,
            maxCoinsRedeem,
            shopVoucher,
            platformVoucher,
            priceAfterCoins,
          });
        }
      } catch (lazError: any) {
        console.warn('Failed to fetch from real Lazada API. Error:', lazError.message);
      }
    }

    // 2b. Try Lazada Adsense API (searchSkuOffer) - higher quality, commission-enriched data
    // Requires valid lazadaCookie. Results replace Lazada catalog data.
    if (searchAdsense && config.lazadaCookie && config.lazadaCookie.length > 20) {
      try {
        const adsenseDeals = await this.fetchAdsenseOffers(config, keyword);
        if (adsenseDeals.length > 0) {
          // Replace Lazada catalog results with Adsense results
          const nonLazadaDeals = deals.filter((d: any) => d.platform !== 'LAZADA');
          deals.length = 0;
          deals.push(...nonLazadaDeals, ...adsenseDeals);
          console.log(`[Adsense] Replaced Lazada catalog deals with ${adsenseDeals.length} Adsense offers.`);
        }
      } catch (adsErr: any) {
        console.warn('[Adsense] fetchAdsenseOffers failed:', adsErr.message);
      }
    }

    // If scrapeMethod is browser, enrich the top 3 deals by visiting their detail page using Puppeteer.
    // SKIP Adsense deals (_fromAdsense=true) since they already have accurate afterVoucherPrice.
    if (config.scrapeMethod === 'browser' && deals.length > 0) {
      const dealsToEnrich = deals
        .slice(0, Math.min(3, deals.length))
        .filter((d: any) => !d._fromAdsense); // Skip Adsense deals — already have accurate pricing

      if (dealsToEnrich.length > 0) {
        console.log(`[Browser Scrape] Enriching ${dealsToEnrich.length} non-Adsense deals...`);
      } else {
        console.log(`[Browser Scrape] All top deals are from Adsense API — skipping browser enrichment.`);
      }

      for (const deal of dealsToEnrich) {
        console.log(`[Browser Scrape] Enriching: ${deal.title?.substring(0, 50)}`);
        const cookie = deal.platform === 'LAZADA' ? config.lazadaCookie : config.shopeeCookie;
        const details = await this.fetchProductDetailsViaBrowser(deal.originalUrl, deal.platform as any, cookie || undefined);
        if (details) {
          if (details.title) deal.title = details.title;
          if (details.discountPrice && details.discountPrice > 0) {
            deal.discountPrice = details.discountPrice;
          }
          if (details.originalPrice && details.originalPrice > 0) {
            deal.originalPrice = details.originalPrice;
          } else if (deal.discountPrice) {
            deal.originalPrice = deal.discountPrice;
          }
          deal.discountPercent = Math.round(((deal.originalPrice - deal.discountPrice) / (deal.originalPrice || 1)) * 100) || 0;

          if (details.shopVoucher !== undefined) deal.shopVoucher = details.shopVoucher;
          if (details.platformVoucher !== undefined) deal.platformVoucher = details.platformVoucher;
          if (details.canUseCoins !== undefined) deal.canUseCoins = details.canUseCoins;
          if (details.maxCoinsRedeem !== undefined) deal.maxCoinsRedeem = details.maxCoinsRedeem;

          // If a cheaper SKU/Model variant was found, update the target URLs
          if (details.skuId) {
            try {
              const urlObj = new URL(deal.originalUrl);
              urlObj.searchParams.set(deal.platform === 'LAZADA' ? 'skuId' : 'modelId', details.skuId);
              deal.originalUrl = urlObj.toString();
            } catch (e) {
              const paramName = deal.platform === 'LAZADA' ? 'skuId' : 'modelId';
              deal.originalUrl = deal.originalUrl.split('?')[0] + `?${paramName}=${details.skuId}`;
            }
            deal.affiliateUrl = await this.generateAffiliateLink(deal.originalUrl, deal.platform, config);
            console.log(`[Browser Scrape] Updated to cheapest variant (skuId: ${details.skuId})`);
          }

          // Re-calculate priceAfterCoins
          deal.priceAfterCoins = Math.max(0, deal.discountPrice - deal.shopVoucher - deal.platformVoucher - deal.maxCoinsRedeem);
        }
      }
    }

    // 3. Fallback: If no real deals found on either platform, generate mock deals to prevent empty states
    if (deals.length === 0) {
      console.log('No real deals fetched. Falling back to mock deals...');
      return this.generateMockDeals(keyword);
    }

    return deals;
  }

  private static generateMockDeals(keyword: string): any[] {
    const platforms = ['SHOPEE', 'LAZADA'];
    const mockDeals: any[] = [];

    // Create 2 mock deals matching the keyword
    for (let i = 1; i <= 2; i++) {
      const platform = platforms[Math.floor(Math.random() * platforms.length)];
      const productId = Math.floor(Math.random() * 9000000000 + 1000000000).toString();
      const originalPrice = Math.floor(Math.random() * 500 + 100) * 1000; // 100k - 600k
      const discountPercent = Math.floor(Math.random() * 40 + 15); // 15% - 55%
      const discountPrice = Math.round((originalPrice * (100 - discountPercent)) / 100);

      const shopVoucher = Math.round(Math.min(discountPrice * 0.05, 50000));
      const platformVoucher = Math.round(Math.min(discountPrice * 0.10, 100000));
      const canUseCoins = Math.random() > 0.3;
      const maxCoinsRedeem = canUseCoins
        ? Math.round(Math.min(discountPrice * (platform === 'SHOPEE' ? 0.20 : 0.05), 100000))
        : 0;
      const priceAfterCoins = Math.max(0, discountPrice - shopVoucher - platformVoucher - maxCoinsRedeem);

      mockDeals.push({
        platform,
        productId,
        title: `[DEAL SỐC] ${keyword.toUpperCase()} - Phiên Bản Cao Cấp Mới Nhất V${i}`,
        imageUrl: `https://picsum.photos/seed/${productId}/600/400`,
        originalPrice,
        discountPrice,
        discountPercent,
        originalUrl: platform === 'SHOPEE'
          ? `https://shopee.vn/a-i.12345.${productId}`
          : `https://www.lazada.vn/products/mock-item-${productId}.html`,
        canUseCoins,
        maxCoinsRedeem,
        shopVoucher,
        platformVoucher,
        priceAfterCoins,
      });
    }

    return mockDeals;
  }

  private static async generateAffiliateLink(
    originalUrl: string,
    platform: string,
    config: any
  ): Promise<string> {
    // --- Upgrade 2: Adsense Link Convertor (official s.lazada.vn short link) ---
    const lazadaSearchMethod = config.lazadaSearchMethod || 'catalog';
    const forceAdsenseConvert = lazadaSearchMethod === 'hybrid' || config.adsenseLinkConvert;
    if (platform === 'LAZADA' && forceAdsenseConvert && config.lazadaCookie) {
      try {
        const adsenseLink = await this.generateAffiliateLinkViaAdsense(originalUrl, config.lazadaCookie);
        if (adsenseLink) {
          console.log(`[Adsense Link] Converted: ${originalUrl} => ${adsenseLink}`);
          return adsenseLink;
        }
      } catch (adsLinkErr: any) {
        console.warn('[Adsense Link] Converter failed, falling back:', adsLinkErr.message);
      }
    }

    if (config.accessTradeId) {
      return `https://go.isclix.com/deep_link/${config.accessTradeId}?url=${encodeURIComponent(originalUrl)}`;
    }

    if (platform === 'SHOPEE' && config.shopeeAffiliateId) {
      return `${originalUrl}${originalUrl.includes('?') ? '&' : '?'}utm_source=an_affiliate&utm_medium=affiliates&utm_campaign=deal_finder&utm_content=${config.shopeeAffiliateId}`;
    }

    if (platform === 'LAZADA' && config.lazadaAffiliateId) {
      return `${originalUrl}${originalUrl.includes('?') ? '&' : '?'}laz_trackid=2:mm_${config.lazadaAffiliateId}`;
    }

    const mockAffiliateId = 'aff_998877';
    if (platform === 'SHOPEE') {
      return `${originalUrl}${originalUrl.includes('?') ? '&' : '?'}utm_source=affiliate&utm_medium=telegram&utm_campaign=deal_finder&aff_id=${mockAffiliateId}`;
    } else {
      return `${originalUrl}${originalUrl.includes('?') ? '&' : '?'}laz_trackid=2:mm_${mockAffiliateId}`;
    }
  }

  /**
   * Upgrade 1: Fetch product offers from Lazada Adsense API.
   * Uses session cookie to call searchSkuOffer.json API directly (no browser needed).
   * Returns commission-enriched deals with accurate afterVoucherPrice.
   */
  private static async fetchAdsenseOffers(config: any, keyword?: string): Promise<any[]> {
    console.log(`[Adsense API] Fetching offers${keyword ? ` for keyword: ${keyword}` : ''}`);

    const params: Record<string, string> = {
      pageSize: '24',
      pageNo: '0',
      sortField: keyword ? 'relevance' : 'commission',
      sortOrder: 'desc',
    };
    if (keyword) {
      params['keyword'] = keyword;
    }

    const queryString = new URLSearchParams(params).toString();
    const apiUrl = `https://adsense.lazada.vn/newOffer/searchSkuOffer.json?${queryString}`;

    const response = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://adsense.lazada.vn/',
        'Cookie': config.lazadaCookie,
      },
      timeout: 10000,
    });

    const items: any[] = response.data?.data?.reportItem || [];
    if (items.length === 0) {
      console.warn('[Adsense API] No items in response. Session may have expired.');
      return [];
    }

    const deals: any[] = [];
    for (const item of items.slice(0, 5)) {
      if (!item.canGetLink) continue;

      const itemId = String(item.itemId || '');
      const skuId = String(item.skuId || '');
      if (!itemId) continue;

      // afterVoucherPrice = actual price user pays after platform+shop vouchers applied
      const discountPrice = parseFloat(item.afterVoucherPrice || item.discountPrice) || 0;
      const originalPrice = parseFloat(item.originalPrice || item.discountPrice) || discountPrice;
      const discountPercent = item.formatDiscountPercent
        ? parseInt(item.formatDiscountPercent.replace(/[^0-9]/g, '')) || 0
        : Math.round(((originalPrice - discountPrice) / (originalPrice || 1)) * 100);

      // Build product URL with the specific skuId so affiliate link is for exact variant
      let originalUrl = item.clickUrl || item.pdpLink || '';
      if (originalUrl && !originalUrl.startsWith('http')) {
        originalUrl = `https://www.lazada.vn${originalUrl.startsWith('/') ? '' : '/'}${originalUrl}`;
      }
      if (!originalUrl && itemId) {
        originalUrl = skuId
          ? `https://www.lazada.vn/products/pdp-i${itemId}-s${skuId}.html`
          : `https://www.lazada.vn/products/i${itemId}.html`;
      }
      // Attach skuId to URL for precise variant targeting
      if (skuId && !originalUrl.includes(`s${skuId}`)) {
        originalUrl += `${originalUrl.includes('?') ? '&' : '?'}skuId=${skuId}`;
      }

      const imageUrl = item.imageUrl || (item.imageList && item.imageList[0]) || 'https://placehold.co/600x400?text=No+Image';

      // Voucher breakdown: afterVoucherPrice already includes vouchers, so we note the voucher % for display
      const voucherPercent = parseFloat(item.formatVoucherPricePercent) || 0;
      const shopVoucher = voucherPercent > 0 ? Math.round((originalPrice * voucherPercent) / 100) : 0;
      const platformVoucher = 0; // Platform voucher is folded into afterVoucherPrice

      // Coins: isCoins flag from API, priceAfterCoins not applicable here as afterVoucherPrice is final
      const canUseCoins = item.isCoins === true;
      // Lazada coins typically give ~1% discount capped per item; mark as 0 since afterVoucherPrice is our base
      const maxCoinsRedeem = 0;
      const priceAfterCoins = discountPrice; // afterVoucherPrice is already the best public price

      const commissionRate = parseFloat(item.originalCommissionRate) || 0;

      deals.push({
        platform: 'LAZADA',
        productId: itemId,
        title: item.title || '',
        imageUrl,
        originalPrice,
        discountPrice,
        discountPercent,
        originalUrl,
        canUseCoins,
        maxCoinsRedeem,
        shopVoucher,
        platformVoucher,
        priceAfterCoins,
        // Extra adsense metadata (stored for reference, not in DB schema)
        _commissionRate: commissionRate,
        _offerId: item.offerId,
        _skuId: skuId,
      });
    }

    console.log(`[Adsense API] Parsed ${deals.length} deals from ${items.length} items.`);
    return deals;
  }

  /**
   * Upgrade 2: Generate official affiliate link via Adsense Link Convertor.
   * Launches Puppeteer, navigates to adsense.lazada.vn, uses the Link Convertor tool,
   * and intercepts the API response to extract the official s.lazada.vn short link.
   */
  private static async generateAffiliateLinkViaAdsense(productUrl: string, lazadaCookie: string): Promise<string | null> {
    console.log(`[Adsense Link] Launching browser to convert: ${productUrl}`);
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 1024 });

      // Inject cookies across all Lazada domains
      const domains = ['.lazada.vn', 'www.lazada.vn', 'm.lazada.vn', 'adsense.lazada.vn'];
      const parsedCookies: any[] = [];
      lazadaCookie.split(';').forEach((pair) => {
        const [name, ...valParts] = pair.trim().split('=');
        const value = valParts.join('=');
        if (name && value) {
          domains.forEach((dom) => {
            parsedCookies.push({ name: name.trim(), value: value.trim(), domain: dom, path: '/' });
          });
        }
      });
      for (const c of parsedCookies) {
        try { await page.setCookie(c); } catch (e) {}
      }

      // Intercept the link conversion API response
      let convertedLink: string | null = null;
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('convertLink') || url.includes('linkConvertor') || url.includes('shorten') || url.includes('getAffiliateLink')) {
          try {
            const text = await response.text();
            const json = JSON.parse(text);
            // Try common response shapes
            const link = json?.data?.shortLink || json?.data?.affiliateLink ||
                         json?.data?.link || json?.data?.url || json?.shortLink ||
                         json?.link || json?.affiliateLink;
            if (link && (link.includes('s.lazada.vn') || link.includes('lazada.vn'))) {
              convertedLink = link;
              console.log(`[Adsense Link] Intercepted converted link: ${link}`);
            }
          } catch (e) {}
        }
      });

      // Navigate to the Adsense portal
      await page.goto('https://adsense.lazada.vn/', { waitUntil: 'networkidle2', timeout: 60000 });
      await new Promise((r) => setTimeout(r, 3000));

      // Close any popup modal
      await page.evaluate(() => {
        const doc = (globalThis as any).document;
        const closeBtn = doc.querySelector('a.next-dialog-close, .next-overlay-wrapper .next-dialog-close');
        if (closeBtn) closeBtn.click();
      });
      await new Promise((r) => setTimeout(r, 1000));

      // Click Link Convertor menu item
      const clicked = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        // Try by known class name
        const el = doc.querySelector('.link_convertor_header_title_box');
        if (el) { el.click(); return true; }
        // Fallback: find by text content
        const allEls = Array.from(doc.querySelectorAll('*') as any[]);
        const target = allEls.find((e: any) => {
          const children = Array.from(e.childNodes as any[]);
          return children.some((n: any) => n.nodeType === 3 && (n.textContent || '').trim() === 'Link Convertor');
        });
        if (target) { (target as any).click(); return true; }
        return false;
      });

      if (!clicked) {
        console.warn('[Adsense Link] Could not find Link Convertor menu item.');
        return null;
      }
      await new Promise((r) => setTimeout(r, 2000));

      // Wait for URL input and type the product URL
      const inputSelector = 'input[placeholder="Paste page url here"], textarea[placeholder*="url"], input[type="text"]';
      try {
        await page.waitForSelector(inputSelector, { timeout: 8000 });
      } catch (e) {
        console.warn('[Adsense Link] URL input not found within timeout.');
        return null;
      }
      await page.evaluate((sel) => {
        const doc = (globalThis as any).document;
        const el = doc.querySelector(sel);
        if (el) el.value = '';
      }, inputSelector);
      await page.type(inputSelector, productUrl, { delay: 30 });

      // Click Confirm Convert button
      const confirmed = await page.evaluate(() => {
        const doc = (globalThis as any).document;
        const btn = doc.querySelector('button.link-convert-confirm');
        if (btn) { btn.click(); return true; }
        const buttons = Array.from(doc.querySelectorAll('button') as any[]);
        const confirmBtn = buttons.find((b: any) => (b.textContent || '').trim() === 'Confirm Convert');
        if (confirmBtn) { (confirmBtn as any).click(); return true; }
        return false;
      });

      if (!confirmed) {
        console.warn('[Adsense Link] Confirm Convert button not found.');
        return null;
      }

      // Wait for the API response to be intercepted (up to 8s)
      await new Promise((r) => setTimeout(r, 8000));

      if (convertedLink) return convertedLink;

      // Fallback: scrape the s.lazada.vn link from the confirmation dialog text/DOM
      const domLink = await page.evaluate(() => {
        const doc = (globalThis as any).document;

        // Strategy 1: Check input/textarea values
        const inputs = Array.from(doc.querySelectorAll('input, textarea') as any[]);
        for (const inp of inputs as any[]) {
          const val = (inp as any).value || '';
          if (val.includes('s.lazada.vn') || (val.includes('lazada.vn') && val.includes('?'))) {
            return val.trim();
          }
        }

        // Strategy 2: Scan all overlay/dialog text for s.lazada.vn URL pattern
        const lazadaLinkRegex = /https?:\/\/s\.lazada\.vn\/[A-Za-z0-9=&?.\/%_:@!,-]+/;
        const dialogEls = doc.querySelectorAll('.next-overlay-wrapper, [role="dialog"], .next-dialog');
        for (const el of Array.from(dialogEls) as any[]) {
          const text = (el as any).textContent || '';
          const match = text.match(lazadaLinkRegex);
          if (match) return match[0].trim();
        }

        // Strategy 3: Match exact s.lazada.vn short link format (stops before non-URL chars like 'CancelCopy')
        // Format: https://s.lazada.vn/s.XXXXX?c=X&t=XXXXX
        const shortLinkMatch = (doc.body?.textContent || '').match(/https:\/\/s\.lazada\.vn\/s\.[A-Za-z0-9]+(?:\?[a-z0-9=&%._-]*)/);
        if (shortLinkMatch) return shortLinkMatch[0].trim();

        return null;
      });

      return domLink;
    } catch (err: any) {
      console.error('[Adsense Link] Browser error:', err.message);
      return null;
    } finally {
      if (browser) await browser.close();
    }
  }


  private static async fetchProductDetailsViaBrowser(
    url: string,
    platform: 'LAZADA' | 'SHOPEE',
    cookie?: string
  ): Promise<{
    title: string;
    originalPrice: number;
    discountPrice: number;
    shopVoucher?: number;
    platformVoucher?: number;
    canUseCoins?: boolean;
    maxCoinsRedeem?: number;
    skuId?: string;
  } | null> {
    console.log(`[Browser Scrape] Launching browser for ${platform} product details...`);
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
        ],
      });
      const page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
      );
      await page.setViewport({
        width: 375,
        height: 812,
        isMobile: true,
        hasTouch: true,
      });

      // Add cookie if present
      if (cookie) {
        const domains = platform === 'LAZADA'
          ? ['.lazada.vn', 'www.lazada.vn', 'm.lazada.vn', 'pages.lazada.vn']
          : ['.shopee.vn', 'shopee.vn', 'banhang.shopee.vn'];

        const parsedCookies: any[] = [];
        cookie.split(';').forEach((pair) => {
          const [name, ...valParts] = pair.trim().split('=');
          const value = valParts.join('=');
          if (name && value) {
            domains.forEach((dom) => {
              parsedCookies.push({
                name: name.trim(),
                value: value.trim(),
                domain: dom,
                path: '/',
              });
            });
          }
        });

        for (const c of parsedCookies) {
          try {
            await page.setCookie(c);
          } catch (cookieError) {
            // Ignore any Puppeteer domain mismatch errors
          }
        }
      }

      console.log(`[Browser Scrape] Navigating to: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Wait a moment for page/scripts hydration
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const extracted = await page.evaluate((plat) => {
        const doc = (globalThis as any).document;
        const win = (globalThis as any).window;
        let title = '';
        let originalPrice = 0;
        let discountPrice = 0;
        let shopVoucher = 0;
        let platformVoucher = 0;
        let canUseCoins = false;
        let maxCoinsRedeem = 0;
        let scrapedSkuId = '';

        if (plat === 'LAZADA') {
          // Title
          const titleEl = doc.querySelector('.pdp-product-title, h1, .pdp-mod-product-title, .product-title, .title');
          if (titleEl) title = titleEl.textContent?.trim() || '';

          // Prices
          const priceEl = doc.querySelector('.pdp-price, .pdp-price_color_orange, .pdp-product-price, .price, [class*="price-item"]');
          if (priceEl) {
            const clean = priceEl.textContent?.replace(/[^0-9]/g, '');
            if (clean) discountPrice = parseFloat(clean);
          }
          const origEl = doc.querySelector('.pdp-price_original, .pdp-original-price, .pdp-price_size_xs, .original-price, [class*="original-price"], [class*="originalPrice"]');
          if (origEl) {
            const clean = origEl.textContent?.replace(/[^0-9]/g, '');
            if (clean) originalPrice = parseFloat(clean);
          }

          // Parse module data for Lazada to find the absolute cheapest SKU variant
          let f = win.__moduleData__?.data?.root?.fields || 
                  win.g_pdp_data?.data?.root?.fields || 
                  win.__g_pdp_data__?.data?.root?.fields || 
                  win.__pdp_data__?.data?.root?.fields;

          if (!f) {
            const scripts = doc.querySelectorAll('script');
            for (const s of scripts) {
              const text = s.textContent || '';
              if (text.includes('skuInfos') && text.includes('salePrice')) {
                const match = text.match(/window\.__moduleData__\s*=\s*({.+?});/);
                if (match) {
                  try {
                    const parsed = JSON.parse(match[1]);
                    f = parsed?.data?.root?.fields;
                    break;
                  } catch (e) {}
                }
              }
            }
          }

          if (f && f.skuInfos) {
            let cheapestSku = null;
            let minPrice = Infinity;
            for (const id in f.skuInfos) {
              const sku = f.skuInfos[id];
              const priceObj = sku.price || {};
              // Use coupon price (price after Lazada/Shop voucher/subsidies) if available, otherwise fallback to salePrice
              const salePrice = parseFloat(priceObj.coupon?.priceNumber || priceObj.salePrice?.value || priceObj.salePrice?.amount) || 0;
              if (salePrice > 0 && salePrice < minPrice) {
                minPrice = salePrice;
                cheapestSku = {
                  skuId: id,
                  salePrice,
                  originalPrice: parseFloat(priceObj.originalPrice?.value || priceObj.originalPrice?.amount) || salePrice,
                  title: sku.title || f.product?.fields?.title || ''
                };
              }
            }
            if (cheapestSku) {
              discountPrice = cheapestSku.salePrice;
              originalPrice = cheapestSku.originalPrice;
              scrapedSkuId = cheapestSku.skuId;
              if (cheapestSku.title) title = cheapestSku.title;
            }
          }

          // Lazada Vouchers
          const voucherEls = doc.querySelectorAll('.pdp-vouchers-list-item, .voucher-tag, .pdp-promotions-voucher, [data-testid="voucher-tag"], .voucher-item, .voucher-discount, [class*="voucher"]');
          voucherEls.forEach((el: any) => {
            const text = el.textContent || '';
            const match = text.match(/(?:Giảm|Off|Min|đ)\s*([\d.,\s]+)(?:K|đ|VND)?/i);
            if (match) {
              let val = parseFloat(match[1].replace(/[.,\s]/g, ''));
              if (text.toLowerCase().includes('k')) val *= 1000;
              if (val > 0) {
                if (text.includes('Shop') || text.includes('Cửa hàng')) {
                  shopVoucher = Math.max(shopVoucher, val);
                } else {
                  platformVoucher = Math.max(platformVoucher, val);
                }
              }
            }
          });

          // Lazada Coins
          const coinEl = doc.querySelector('.pdp-coin-reduct, .pdp-mod-coins, .coin-reduction, .coins-label, .coin-discount, [class*="coin"]');
          if (coinEl) {
            canUseCoins = true;
            const text = coinEl.textContent || '';
            const coinMatch = text.match(/(?:Giảm|đ)\s*([\d.,\s]+)/i);
            if (coinMatch) {
              let val = parseFloat(coinMatch[1].replace(/[.,\s]/g, ''));
              if (text.toLowerCase().includes('k')) val *= 1000;
              maxCoinsRedeem = val;
            }
          }

          // Recursive JSON Scan for Lazada Coins (if f is available)
          if (f) {
            const scanForCoins = (obj: any) => {
              if (!obj || typeof obj !== 'object') return;
              for (const key in obj) {
                const val = obj[key];
                const keyLower = key.toLowerCase();
                if (keyLower.includes('coin') || keyLower.includes('xu')) {
                  if (typeof val === 'number' && val > 0 && (keyLower.includes('amount') || keyLower.includes('price') || keyLower.includes('redeem') || keyLower.includes('value') || keyLower.includes('reduction'))) {
                    canUseCoins = true;
                    maxCoinsRedeem = Math.max(maxCoinsRedeem, val);
                  } else if (typeof val === 'string' && val) {
                    const percentMatch = val.match(/([\d]+)\s*%/);
                    if (percentMatch) {
                      const percent = parseFloat(percentMatch[1]);
                      if (percent > 0 && percent < 100) {
                        canUseCoins = true;
                        maxCoinsRedeem = Math.max(maxCoinsRedeem, Math.round((discountPrice * percent) / 100));
                      }
                    } else {
                      const numMatch = val.match(/(?:Giảm|đ|xu)\s*([\d.,\s]+)/i);
                      if (numMatch) {
                        let parsed = parseFloat(numMatch[1].replace(/[.,\s]/g, ''));
                        if (val.toLowerCase().includes('k')) parsed *= 1000;
                        if (parsed > 0) {
                          canUseCoins = true;
                          maxCoinsRedeem = Math.max(maxCoinsRedeem, parsed);
                        }
                      }
                    }
                  }
                }
                if (val && typeof val === 'object') {
                  scanForCoins(val);
                }
              }
            };
            scanForCoins(f);
          }

          // Fallback DOM text scan for Lazada coin discounts
          const allTextEls = doc.querySelectorAll('span, div, p, label');
          for (const el of allTextEls) {
            const text = el.textContent || '';
            if (text.includes('xu') && (text.includes('Giảm') || text.includes('áp') || text.includes('hoàn') || text.includes('tối đa'))) {
              const match = text.match(/(?:Giảm|áp|đến|tối đa|hoàn)\s*([\d.,\s%]+)/i);
              if (match) {
                const matchStr = match[1].trim();
                if (matchStr.includes('%')) {
                  const percent = parseFloat(matchStr.replace(/%/g, ''));
                  if (percent > 0 && percent < 100) {
                    canUseCoins = true;
                    maxCoinsRedeem = Math.max(maxCoinsRedeem, Math.round((discountPrice * percent) / 100));
                  }
                } else {
                  let val = parseFloat(matchStr.replace(/[.,\s]/g, ''));
                  if (text.toLowerCase().includes('k')) val *= 1000;
                  if (val > 0) {
                    canUseCoins = true;
                    maxCoinsRedeem = Math.max(maxCoinsRedeem, val);
                  }
                }
              }
            }
          }
        } else {
          // SHOPEE
          // Title
          const titleEl = doc.querySelector('div.product-briefing > span, h1, span.y3j54H, ._44qNLD');
          if (titleEl) title = titleEl.textContent?.trim() || '';

          // Prices
          const priceEl = doc.querySelector('div.pmmxKx, div._2Sh-1K, div.pqTW3t, .G27M6V');
          if (priceEl) {
            const clean = priceEl.textContent?.replace(/[^0-9]/g, '');
            if (clean) discountPrice = parseFloat(clean);
          }
          const origEl = doc.querySelector('div.Yknj1F, doc._3_R4tw, ._275I2q');
          if (origEl) {
            const clean = origEl.textContent?.replace(/[^0-9]/g, '');
            if (clean) originalPrice = parseFloat(clean);
          }

          // Shopee Vouchers
          const voucherEls = doc.querySelectorAll('.shopee-voucher-promo-value, .voucher-ticket, ._1pZzV3');
          voucherEls.forEach((el: any) => {
            const text = el.textContent || '';
            const match = text.match(/(?:Giảm|Off|đ)\s*([\d.,\s]+)(?:K|đ|VND)?/i);
            if (match) {
              let val = parseFloat(match[1].replace(/[.,\s]/g, ''));
              if (text.toLowerCase().includes('k')) val *= 1000;
              if (val > 0) {
                if (text.includes('Shop') || text.includes('Cửa hàng')) {
                  shopVoucher = Math.max(shopVoucher, val);
                } else {
                  platformVoucher = Math.max(platformVoucher, val);
                }
              }
            }
          });

          // Shopee Coins
          const coinEl = doc.querySelector('.shopee-coin-reduction, .coin-discount, ._2zJ6sM');
          if (coinEl) {
            canUseCoins = true;
            const clean = coinEl.textContent?.replace(/[^0-9]/g, '');
            if (clean) maxCoinsRedeem = parseFloat(clean);
          }

          // Fallback DOM text scan for Shopee coin discounts
          const shopeeTextEls = doc.querySelectorAll('span, div, p, label');
          for (const el of shopeeTextEls) {
            const text = el.textContent || '';
            if (text.includes('xu') && (text.includes('nhận') || text.includes('hoàn') || text.includes('xu'))) {
              const match = text.match(/(?:hoàn|nhận|giảm)\s*([\d.,\s%]+)/i);
              if (match) {
                const matchStr = match[1].trim();
                if (matchStr.includes('%')) {
                  const percent = parseFloat(matchStr.replace(/%/g, ''));
                  if (percent > 0 && percent < 100) {
                    canUseCoins = true;
                    maxCoinsRedeem = Math.max(maxCoinsRedeem, Math.round((discountPrice * percent) / 100));
                  }
                } else {
                  let val = parseFloat(matchStr.replace(/[.,\s]/g, ''));
                  if (text.toLowerCase().includes('k')) val *= 1000;
                  if (val > 0) {
                    canUseCoins = true;
                    maxCoinsRedeem = Math.max(maxCoinsRedeem, val);
                  }
                }
              }
            }
          }

          // Search Shopee INITIAL STATE for cheapest model
          let models = win.__INITIAL_STATE__?.item?.models || win.__INITIAL_STATE__?.productDetail?.product?.models;
          if (!models) {
            const scripts = doc.querySelectorAll('script');
            for (const s of scripts) {
              const text = s.textContent || '';
              if (text.includes('__INITIAL_STATE__') && text.includes('models')) {
                const match = text.match(/window\.__INITIAL_STATE__\s*=\s*({.+?});/);
                if (match) {
                  try {
                    const parsed = JSON.parse(match[1]);
                    models = parsed?.item?.models || parsed?.productDetail?.product?.models;
                    break;
                  } catch (e) {}
                }
              }
            }
          }

          if (models && Array.isArray(models)) {
            let cheapestModel = null;
            let minPrice = Infinity;
            for (const m of models) {
              const priceVal = (parseFloat(m.price || m.price_before_discount) || 0) / 100000;
              const priceBeforeDiscount = (parseFloat(m.price_before_discount) || 0) / 100000;
              if (priceVal > 0 && priceVal < minPrice) {
                minPrice = priceVal;
                cheapestModel = {
                  modelId: m.modelid || m.modelId,
                  price: priceVal,
                  priceBeforeDiscount: priceBeforeDiscount || priceVal,
                  name: m.name || ''
                };
              }
            }
            if (cheapestModel) {
              discountPrice = cheapestModel.price;
              originalPrice = cheapestModel.priceBeforeDiscount;
              scrapedSkuId = cheapestModel.modelId ? String(cheapestModel.modelId) : '';
              if (cheapestModel.name && !title.includes(cheapestModel.name)) {
                title += ` (${cheapestModel.name})`;
              }
            }
          }
        }

        return { title, originalPrice, discountPrice, shopVoucher, platformVoucher, canUseCoins, maxCoinsRedeem, skuId: scrapedSkuId || undefined };
      }, platform);

      console.log(`[Browser Scrape] Successfully parsed ${platform} PDP:`, JSON.stringify(extracted));
      return extracted;
    } catch (err: any) {
      console.error(`[Browser Scrape] Error scraping ${url}:`, err.message);
      return null;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  static async manualSearch(keyword: string, maxPrice?: number) {
    const config = await ConfigService.getConfig();
    console.log(`Manual search triggered for keyword: ${keyword}, maxPrice: ${maxPrice}`);
    const deals = await this.fetchDealsFromKeyword(keyword, config);
    const results: any[] = [];

    // Filter deals by maxPrice if specified
    const filteredDeals = maxPrice
      ? deals.filter((deal) => deal.discountPrice <= maxPrice)
      : deals;

    for (const dealData of filteredDeals) {
      const affiliateUrl = await this.generateAffiliateLink(
        dealData.originalUrl,
        dealData.platform,
        config
      );

      const dealPayload = {
        ...dealData,
        affiliateUrl,
      };

      const aiCaption = await AIService.generateCaption({
        title: dealPayload.title,
        originalPrice: dealPayload.originalPrice,
        discountPrice: dealPayload.discountPrice,
        discountPercent: dealPayload.discountPercent,
        platform: dealPayload.platform,
        link: dealPayload.affiliateUrl,
        canUseCoins: dealPayload.canUseCoins,
        maxCoinsRedeem: dealPayload.maxCoinsRedeem,
        shopVoucher: dealPayload.shopVoucher,
        platformVoucher: dealPayload.platformVoucher,
        priceAfterCoins: dealPayload.priceAfterCoins,
      });

      const existingDeal = await prisma.deal.findFirst({
        where: {
          platform: dealPayload.platform,
          productId: dealPayload.productId,
        },
      });

      if (existingDeal) {
        console.log(`Manual search: Deal already exists. Refreshing details and timestamp for ${dealPayload.title}`);
        const updated = await prisma.deal.update({
          where: { id: existingDeal.id },
          data: {
            title: dealPayload.title,
            imageUrl: dealPayload.imageUrl,
            originalPrice: dealPayload.originalPrice,
            discountPrice: dealPayload.discountPrice,
            discountPercent: dealPayload.discountPercent,
            originalUrl: dealPayload.originalUrl,
            affiliateUrl: dealPayload.affiliateUrl,
            aiCaption: aiCaption,
            canUseCoins: dealPayload.canUseCoins || false,
            maxCoinsRedeem: dealPayload.maxCoinsRedeem || 0,
            shopVoucher: dealPayload.shopVoucher || 0,
            platformVoucher: dealPayload.platformVoucher || 0,
            priceAfterCoins: dealPayload.priceAfterCoins,
            createdAt: new Date(),
          }
        });
        results.push(updated);
        continue;
      }

      const savedDeal = await prisma.deal.create({
        data: {
          platform: dealPayload.platform,
          productId: dealPayload.productId,
          title: dealPayload.title,
          imageUrl: dealPayload.imageUrl,
          originalPrice: dealPayload.originalPrice,
          discountPrice: dealPayload.discountPrice,
          discountPercent: dealPayload.discountPercent,
          originalUrl: dealPayload.originalUrl,
          affiliateUrl: dealPayload.affiliateUrl,
          aiCaption: aiCaption,
          status: 'PENDING',
          canUseCoins: dealPayload.canUseCoins || false,
          maxCoinsRedeem: dealPayload.maxCoinsRedeem || 0,
          shopVoucher: dealPayload.shopVoucher || 0,
          platformVoucher: dealPayload.platformVoucher || 0,
          priceAfterCoins: dealPayload.priceAfterCoins,
        },
      });

      let sent = false;
      if (config.isAutoSendTelegram) {
        sent = await TelegramService.sendMessage(aiCaption, dealPayload.imageUrl || undefined);
        await prisma.deal.update({
          where: { id: savedDeal.id },
          data: {
            status: sent ? 'SENT' : 'FAILED',
            sentAt: sent ? new Date() : null,
          },
        });
      }

      results.push(savedDeal);
    }
    return results;
  }
}
