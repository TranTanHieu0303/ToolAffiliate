/**
 * Test script: Verify Upgrade 1 & 2 integration
 * - Upgrade 1: fetchAdsenseOffers() via searchSkuOffer.json API
 * - Upgrade 2: generateAffiliateLinkViaAdsense() via Link Convertor
 *
 * Run: node scratch/test-adsense-integration.js
 */

const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

async function testUpgrade1_AdsenseApiOffers(config, keyword = '') {
  console.log('\n======================================================');
  console.log('UPGRADE 1 TEST: fetchAdsenseOffers via HTTP API');
  console.log('======================================================');

  if (!config.lazadaCookie) {
    console.error('❌ lazadaCookie is not set in SystemConfig. Cannot test Adsense API.');
    return;
  }

  const params = {
    pageSize: '10',
    pageNo: '0',
    sortField: keyword ? 'relevance' : 'commission',
    sortOrder: 'desc',
  };
  if (keyword) params['keyword'] = keyword;

  const queryString = new URLSearchParams(params).toString();
  const apiUrl = `https://adsense.lazada.vn/newOffer/searchSkuOffer.json?${queryString}`;

  console.log(`→ Calling: ${apiUrl}`);
  console.log(`→ Using cookie (first 60 chars): ${(config.lazadaCookie || '').substring(0, 60)}...`);

  try {
    const response = await axios.get(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://adsense.lazada.vn/',
        'Cookie': config.lazadaCookie,
      },
      timeout: 10000,
    });

    const items = response.data?.data?.reportItem || [];
    const success = response.data?.success;

    if (!success) {
      console.error('❌ API returned success=false. Session may have expired.');
      console.log('   Response:', JSON.stringify(response.data).substring(0, 300));
      return;
    }

    if (items.length === 0) {
      console.warn('⚠️  API returned 0 items. Session may have expired or no products found.');
      return;
    }

    console.log(`✅ Success! Got ${items.length} items from Adsense API\n`);

    // Print top 3 deals
    items.slice(0, 3).forEach((item, i) => {
      const discountPrice = parseFloat(item.afterVoucherPrice || item.discountPrice) || 0;
      const originalPrice = parseFloat(item.originalPrice) || discountPrice;
      const commission = item.formatTotalCommissionRate || '0%';
      const isCoins = item.isCoins ? '🪙 Có áp xu' : '—';

      console.log(`  [Deal ${i + 1}] ${item.title?.substring(0, 60)}...`);
      console.log(`    Giá gốc:         ${originalPrice.toLocaleString('vi-VN')} ₫`);
      console.log(`    Giá sau voucher: ${discountPrice.toLocaleString('vi-VN')} ₫ ← afterVoucherPrice`);
      console.log(`    Hoa hồng:        ${commission}`);
      console.log(`    Áp xu:           ${isCoins}`);
      console.log(`    itemId/skuId:    ${item.itemId} / ${item.skuId}`);
      console.log(`    canGetLink:      ${item.canGetLink}`);
      console.log('');
    });

  } catch (err) {
    if (err.response?.status === 302 || err.response?.status === 401 || err.response?.status === 403) {
      console.error(`❌ Session expired (HTTP ${err.response.status}). Please refresh lazadaCookie in config.`);
    } else {
      console.error('❌ Request failed:', err.message);
    }
  }
}

async function testUpgrade2_AffiliateLinkConversion(config, testUrl = 'https://www.lazada.vn/products/i13395072524.html') {
  console.log('\n======================================================');
  console.log('UPGRADE 2 TEST: generateAffiliateLinkViaAdsense');
  console.log('======================================================');

  if (!config.lazadaCookie) {
    console.error('❌ lazadaCookie is not set in SystemConfig. Cannot test Link Convertor.');
    return;
  }

  if (!config.adsenseLinkConvert) {
    console.warn('⚠️  adsenseLinkConvert is disabled in config. Skipping browser link conversion test.');
    console.log('   To enable: UPDATE SystemConfig SET adsenseLinkConvert=1 WHERE id="default"');
    console.log('   Or use the admin UI Config page to toggle "Adsense Link Convert".');
    return;
  }

  console.log(`→ Converting URL: ${testUrl}`);
  console.log('→ Launching Puppeteer browser...');

  const puppeteer = require('puppeteer');
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1024 });

    // Inject cookies
    const domains = ['.lazada.vn', 'www.lazada.vn', 'm.lazada.vn', 'adsense.lazada.vn'];
    const parsedCookies = [];
    config.lazadaCookie.split(';').forEach(pair => {
      const [name, ...valParts] = pair.trim().split('=');
      const value = valParts.join('=');
      if (name && value) {
        domains.forEach(dom => {
          parsedCookies.push({ name: name.trim(), value: value.trim(), domain: dom, path: '/' });
        });
      }
    });
    for (const c of parsedCookies) {
      try { await page.setCookie(c); } catch (e) {}
    }

    let convertedLink = null;

    // Intercept conversion API
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('convertLink') || url.includes('linkConvertor') || url.includes('shorten') || url.includes('getAffiliateLink')) {
        try {
          const text = await response.text();
          console.log(`[Intercept] ${url}`);
          console.log(`[Intercept] Body (preview): ${text.substring(0, 200)}`);
          const json = JSON.parse(text);
          const link = json?.data?.shortLink || json?.data?.affiliateLink ||
                       json?.data?.link || json?.data?.url ||
                       json?.shortLink || json?.link || json?.affiliateLink;
          if (link && link.includes('lazada.vn')) {
            convertedLink = link;
            console.log(`✅ Intercepted link: ${link}`);
          }
        } catch (e) {}
      }
    });

    await page.goto('https://adsense.lazada.vn/', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    // Close popup
    await page.evaluate(() => {
      const doc = globalThis.document;
      const closeBtn = doc.querySelector('a.next-dialog-close');
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Click Link Convertor
    const clicked = await page.evaluate(() => {
      const doc = globalThis.document;
      const el = doc.querySelector('.link_convertor_header_title_box');
      if (el) { el.click(); return true; }
      const allEls = Array.from(doc.querySelectorAll('*'));
      const target = allEls.find(e => {
        return Array.from(e.childNodes).some(n => n.nodeType === 3 && n.textContent.trim() === 'Link Convertor');
      });
      if (target) { target.click(); return true; }
      return false;
    });

    console.log(`→ Clicked Link Convertor: ${clicked}`);
    if (!clicked) {
      console.error('❌ Could not find Link Convertor menu item. Session may have expired.');
      const screenshot = require('path').join(__dirname, 'test_link_convertor_fail.png');
      await page.screenshot({ path: screenshot });
      console.log(`   Screenshot saved: ${screenshot}`);
      return;
    }
    await new Promise(r => setTimeout(r, 2000));

    // Type URL
    const inputSelector = 'input[placeholder="Paste page url here"], textarea[placeholder*="url"], input[type="text"]';
    try {
      await page.waitForSelector(inputSelector, { timeout: 8000 });
    } catch (e) {
      console.error('❌ URL input not found within 8s.');
      return;
    }
    await page.evaluate(sel => {
      const el = globalThis.document.querySelector(sel);
      if (el) el.value = '';
    }, inputSelector);
    await page.type(inputSelector, testUrl, { delay: 30 });

    // Click Confirm
    const confirmed = await page.evaluate(() => {
      const doc = globalThis.document;
      const btn = doc.querySelector('button.link-convert-confirm');
      if (btn) { btn.click(); return true; }
      const buttons = Array.from(doc.querySelectorAll('button'));
      const confirmBtn = buttons.find(b => b.textContent.trim() === 'Confirm Convert');
      if (confirmBtn) { confirmBtn.click(); return true; }
      return false;
    });
    console.log(`→ Clicked Confirm Convert: ${confirmed}`);

    await new Promise(r => setTimeout(r, 8000));

    if (convertedLink) {
      console.log(`\n✅ Upgrade 2 SUCCESS!`);
      console.log(`   Original URL: ${testUrl}`);
      console.log(`   Affiliate Link: ${convertedLink}`);
    } else {
      // Try DOM fallback
      const domLink = await page.evaluate(() => {
        const doc = globalThis.document;

        // Strategy 1: input/textarea values
        const inputs = Array.from(doc.querySelectorAll('input, textarea'));
        for (const inp of inputs) {
          const val = inp.value || '';
          if (val.includes('s.lazada.vn') || (val.includes('lazada.vn') && val.includes('?'))) return val.trim();
        }

        // Strategy 2: Dialog/overlay text content (exact short link pattern)
        const dialogEls = doc.querySelectorAll('.next-overlay-wrapper, [role="dialog"], .next-dialog');
        for (const el of Array.from(dialogEls)) {
          const match = (el.textContent || '').match(/https:\/\/s\.lazada\.vn\/s\.[A-Za-z0-9]+(?:\?[a-z0-9=&%._-]*)/);
          if (match) return match[0].trim();
        }

        // Strategy 3: Exact s.lazada.vn short link format (stops before non-URL chars like 'CancelCopy')
        const shortLinkMatch = (doc.body?.textContent || '').match(/https:\/\/s\.lazada\.vn\/s\.[A-Za-z0-9]+(?:\?[a-z0-9=&%._-]*)/);
        if (shortLinkMatch) return shortLinkMatch[0].trim();

        return null;
      });
      if (domLink) {
        console.log(`\n✅ Upgrade 2 SUCCESS (DOM fallback)!`);
        console.log(`   Affiliate Link: ${domLink}`);
      } else {
        console.error('\n❌ Upgrade 2 FAILED: No converted link found.');
        const screenshot = require('path').join(__dirname, 'test_link_convertor_result.png');
        await page.screenshot({ path: screenshot, fullPage: true });
        console.log(`   Screenshot saved: ${screenshot}`);
      }
    }
  } catch (err) {
    console.error('❌ Browser error:', err.message);
  } finally {
    if (browser) await browser.close();
  }
}

async function main() {
  const prisma = new PrismaClient();
  let config;
  try {
    config = await prisma.systemConfig.findUnique({ where: { id: 'default' } });
  } finally {
    await prisma.$disconnect();
  }

  if (!config) {
    console.error('❌ No SystemConfig found in database. Please configure the system first.');
    process.exit(1);
  }

  console.log('\n🔍 Config check:');
  console.log(`   lazadaCookie set: ${!!(config.lazadaCookie && config.lazadaCookie.length > 10)}`);
  console.log(`   adsenseLinkConvert: ${config.adsenseLinkConvert}`);
  console.log(`   scrapeMethod: ${config.scrapeMethod}`);

  const keyword = process.argv[2] || '';
  const testUrl = process.argv[3] || 'https://www.lazada.vn/products/i13395072524.html';

  await testUpgrade1_AdsenseApiOffers(config, keyword);
  await testUpgrade2_AffiliateLinkConversion(config, testUrl);

  console.log('\n✨ Test complete.\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
