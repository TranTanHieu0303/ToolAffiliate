const { PrismaClient } = require('@prisma/client');
const puppeteer = require('puppeteer');

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

  // Monitor dynamic .json API requests
  page.on('request', request => {
    const url = request.url();
    if (url.includes('.json')) {
      console.log(`[API Request] ${request.method()} | ${url}`);
      if (request.postData()) {
        console.log(`  Payload: ${request.postData()}`);
      }
    }
  });

  page.on('response', response => {
    const url = response.url();
    if (url.includes('.json')) {
      console.log(`[API Response] ${response.status()} | ${url}`);
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

  console.log('Navigating directly to Product Offer page...');
  await page.goto('https://adsense.lazada.vn/index.htm#!/offer/product_offer', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 8000));

  await browser.close();
}

main().catch(console.error);
