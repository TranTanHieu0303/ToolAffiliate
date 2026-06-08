const { PrismaClient } = require('@prisma/client');
const puppeteer = require('puppeteer');
const path = require('path');

async function main() {
  const prisma = new PrismaClient();
  const config = await prisma.systemConfig.findUnique({ where: { id: 'default' } });
  await prisma.$disconnect();

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1024 });

  // Log all dynamic requests
  page.on('request', request => {
    const url = request.url();
    if (
      !url.endsWith('.js') &&
      !url.endsWith('.css') &&
      !url.endsWith('.png') &&
      !url.endsWith('.jpg') &&
      !url.endsWith('.gif') &&
      !url.endsWith('.woff') &&
      !url.endsWith('.woff2') &&
      !url.endsWith('.svg') &&
      !url.includes('arms-retcode')
    ) {
      console.log(`[Request] ${request.method()} | ${url}`);
      if (request.postData()) {
        console.log(`  Payload: ${request.postData()}`);
      }
    }
  });

  page.on('response', response => {
    const url = response.url();
    if (
      !url.endsWith('.js') &&
      !url.endsWith('.css') &&
      !url.endsWith('.png') &&
      !url.endsWith('.jpg') &&
      !url.endsWith('.gif') &&
      !url.endsWith('.woff') &&
      !url.endsWith('.woff2') &&
      !url.endsWith('.svg') &&
      !url.includes('arms-retcode')
    ) {
      console.log(`[Response] ${response.status()} | ${url}`);
    }
  });

  const domains = ['.lazada.vn', 'www.lazada.vn', 'm.lazada.vn', 'adsense.lazada.vn'];
  const cookies = [];
  config.lazadaCookie.split(';').forEach((pair) => {
    const [name, ...valParts] = pair.trim().split('=');
    const value = valParts.join('=');
    if (name && value) {
      domains.forEach((dom) => {
        cookies.push({
          name: name.trim(),
          value: value.trim(),
          domain: dom,
          path: '/',
        });
      });
    }
  });

  for (const c of cookies) {
    try {
      await page.setCookie(c);
    } catch (e) {}
  }

  await page.goto('https://adsense.lazada.vn/', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));

  // Close popup modal
  await page.evaluate(() => {
    const btn = document.querySelector('a.next-dialog-close');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  console.log('Expanding Offer menu...');
  await page.evaluate(() => {
    const offerMenu = document.querySelector('div[title="adsense.menu.offer"]');
    if (offerMenu) offerMenu.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  console.log('Clicking High-Commission Offer...');
  await page.evaluate(() => {
    const hcMenu = document.querySelector('li[title="adsense.menu.partner-hign-commission-offer"]');
    if (hcMenu) {
      hcMenu.click();
    } else {
      // Try by text
      const els = Array.from(document.querySelectorAll('.next-menu-item-text'));
      const hcEl = els.find(el => el.textContent && el.textContent.trim() === 'High-Commission Offer');
      if (hcEl) {
        hcEl.click();
      }
    }
  });

  console.log('Waiting for High-Commission Offer page to load...');
  await new Promise(r => setTimeout(r, 8000));

  const currentUrl = page.url();
  console.log('Current URL after click:', currentUrl);

  // Take screenshot
  const screenshotPath = path.join(__dirname, 'adsense_high_commission_page.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved to:', screenshotPath);

  await browser.close();
}

main().catch(console.error);
