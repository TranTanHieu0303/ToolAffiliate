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

  // Log all dynamic requests
  page.on('request', request => {
    const url = request.url();
    // Exclude static assets
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

  console.log('Navigating to adsense.lazada.vn...');
  await page.goto('https://adsense.lazada.vn/', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 6000));

  console.log('Clicking Link Convertor...');
  const clicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'));
    const target = els.find(el => {
      const children = Array.from(el.childNodes);
      return children.some(node => node.nodeType === 3 && node.textContent.trim() === 'Link Convertor');
    });
    if (target) {
      target.click();
      return true;
    }
    return false;
  });
  console.log('Clicked Link Convertor?', clicked);
  await new Promise(r => setTimeout(r, 5000));

  await browser.close();
}

main().catch(console.error);
