import { prisma } from './services/prisma.service';
import { DealFinderService } from './services/deal-finder.service';
import { ConfigService } from './services/config.service';
import * as path from 'path';
import * as fs from 'fs';

async function main() {
  console.log('--- STARTING ADSENSE DIAGNOSTIC ---');
  const config = await ConfigService.getConfig();
  
  console.log('Current configurations:');
  console.log(`- scrapeMethod: ${config.scrapeMethod}`);
  console.log(`- lazadaSearchMethod: ${config.lazadaSearchMethod}`);
  console.log(`- adsenseLinkConvert: ${config.adsenseLinkConvert}`);
  console.log(`- shopeeCookie length: ${config.shopeeCookie?.length || 0}`);
  console.log(`- lazadaCookie length: ${config.lazadaCookie?.length || 0}`);

  if (!config.lazadaCookie || config.lazadaCookie.length < 20) {
    console.error('ERROR: No valid Lazada Cookie found in the database. Please input it in the UI Config page first.');
    return;
  }

  // Use a typical Lazada product link to test
  const testUrl = 'https://www.lazada.vn/products/ban-phim-co-gaming-khong-day-e-dra-ek361w-phien-ban-v2-3-mode-den-led-rgb-o-cam-kem-switch-hotswap-e-dra-switch-chinh-hang-i1599385686.html';
  console.log(`\nAttempting to convert product URL: ${testUrl}`);

  // We will run Puppeteer with headless: false or true and capture screenshot
  const result = await testAdsenseConvert(testUrl, config.lazadaCookie);
  console.log(`\nResult of Adsense convert: ${result}`);
  console.log('--- DIAGNOSTIC COMPLETE ---');
}

async function testAdsenseConvert(productUrl: string, lazadaCookie: string): Promise<string | null> {
  console.log(`[Diagnostic] Launching browser...`);
  let browser;
  try {
    const puppeteerModule = await import('puppeteer');
    const puppeteer = puppeteerModule.default || puppeteerModule;
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

    let convertedLink: string | null = null;
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('convertLink') || url.includes('linkConvertor') || url.includes('shorten') || url.includes('getAffiliateLink')) {
        try {
          const text = await response.text();
          console.log(`[Diagnostic API Response] URL: ${url}`);
          console.log(`[Diagnostic API Response] Data: ${text.substring(0, 500)}`);
          const json = JSON.parse(text);
          const link = json?.data?.shortLink || json?.data?.affiliateLink ||
                       json?.data?.link || json?.data?.url || json?.shortLink ||
                       json?.link || json?.affiliateLink;
          if (link && (link.includes('s.lazada.vn') || link.includes('lazada.vn'))) {
            convertedLink = link;
          }
        } catch (e) {}
      }
    });

    console.log('[Diagnostic] Navigating directly to linkConvertor page...');
    await page.goto('https://adsense.lazada.vn/workspace/linkConvertor', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 4000));

    // Save initial screenshot
    const screenshotDir = path.join(__dirname, '..');
    const screenshotPath1 = path.join(screenshotDir, 'adsense_landing.png');
    await page.screenshot({ path: screenshotPath1 });
    console.log(`[Diagnostic] Captured landing screenshot at: ${screenshotPath1}`);

    const currentUrl = page.url();
    console.log(`[Diagnostic] Current URL: ${currentUrl}`);
    if (currentUrl.includes('member.lazada.vn/user/login') || currentUrl.includes('login')) {
      console.error('[Diagnostic] REDIRECTED TO LOGIN PAGE. Your cookie is invalid or expired for adsense.lazada.vn.');
      return null;
    }

    // Dismiss any modal
    await page.evaluate(() => {
      const doc = (globalThis as any).document;
      const closeBtn = doc.querySelector('a.next-dialog-close, .next-overlay-wrapper .next-dialog-close');
      if (closeBtn) {
        console.log('[Diagnostic] Clicking close modal button');
        closeBtn.click();
      }
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Enter URL in input field
    const inputSelector = 'input[placeholder="Paste page url here"], textarea[placeholder*="url"], input[type="text"]';
    try {
      await page.waitForSelector(inputSelector, { timeout: 8000 });
    } catch (e) {
      console.error('[Diagnostic] URL Input field not found in DOM.');
      const domHtml = await page.content();
      fs.writeFileSync(path.join(screenshotDir, 'adsense_dom.html'), domHtml);
      console.log(`[Diagnostic] Saved DOM HTML to adsense_dom.html`);
      return null;
    }

    await page.evaluate((sel) => {
      const doc = (globalThis as any).document;
      const el = doc.querySelector(sel);
      if (el) el.value = '';
    }, inputSelector);
    await page.type(inputSelector, productUrl, { delay: 30 });
    console.log(`[Diagnostic] Typed product URL`);

    // Take screenshot after typing
    const screenshotPath2 = path.join(screenshotDir, 'adsense_typed.png');
    await page.screenshot({ path: screenshotPath2 });

    // Click Confirm Convert
    console.log('[Diagnostic] Attempting to click Confirm Convert button...');
    const confirmed = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      const btn = doc.querySelector('button.link-convert-confirm');
      if (btn) { btn.click(); return 'selector'; }
      const buttons = Array.from(doc.querySelectorAll('button') as any[]);
      const confirmBtn = buttons.find((b: any) => (b.textContent || '').trim() === 'Confirm Convert');
      if (confirmBtn) { (confirmBtn as any).click(); return 'text_match'; }
      return null;
    });

    console.log(`[Diagnostic] Click status: ${confirmed}`);
    if (!confirmed) {
      console.error('[Diagnostic] Confirm Convert button not found.');
      return null;
    }

    await new Promise((r) => setTimeout(r, 6000));
    
    // Take screenshot after convert click
    const screenshotPath3 = path.join(screenshotDir, 'adsense_after_click.png');
    await page.screenshot({ path: screenshotPath3 });
    console.log(`[Diagnostic] Captured post-click screenshot at: ${screenshotPath3}`);

    if (convertedLink) return convertedLink;

    // Scan DOM for link
    const domLink = await page.evaluate(() => {
      const doc = (globalThis as any).document;
      const inputs = Array.from(doc.querySelectorAll('input, textarea') as any[]);
      for (const inp of inputs as any[]) {
        const val = (inp as any).value || '';
        if (val.includes('s.lazada.vn') || (val.includes('lazada.vn') && val.includes('?'))) {
          return val.trim();
        }
      }
      const lazadaLinkRegex = /https?:\/\/s\.lazada\.vn\/[A-Za-z0-9=&?.\/%_:@!,-]+/;
      const dialogEls = doc.querySelectorAll('.next-overlay-wrapper, [role="dialog"], .next-dialog');
      for (const el of Array.from(dialogEls) as any[]) {
        const text = (el as any).textContent || '';
        const match = text.match(lazadaLinkRegex);
        if (match) return match[0].trim();
      }
      const shortLinkMatch = (doc.body?.textContent || '').match(/https:\/\/s\.lazada\.vn\/s\.[A-Za-z0-9]+(?:\?[a-z0-9=&%._-]*)/);
      if (shortLinkMatch) return shortLinkMatch[0].trim();
      return null;
    });

    return domLink;
  } catch (err: any) {
    console.error('[Diagnostic] Error:', err.message);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

main().catch(console.error);
