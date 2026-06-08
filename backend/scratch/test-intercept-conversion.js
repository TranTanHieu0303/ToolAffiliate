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
  await new Promise(r => setTimeout(r, 5000));

  console.log('Clicking Link Convertor...');
  const targetSelector = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'));
    const target = els.find(el => {
      const children = Array.from(el.childNodes);
      return children.some(node => node.nodeType === 3 && node.textContent.trim() === 'Link Convertor');
    });
    if (target) {
      target.classList.add('my-custom-click-target');
      return '.my-custom-click-target';
    }
    return null;
  });

  if (targetSelector) {
    await page.click(targetSelector);
    console.log('Clicked target.');
  }

  console.log('Waiting for textarea...');
  await page.waitForSelector('textarea', { timeout: 10000 });
  console.log('Textarea ready. Typing...');
  await page.type('textarea', 'https://www.lazada.vn/products/i13395072524.html');

  // Find the Confirm Convert button
  const btnSelector = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const confirmBtn = buttons.find(b => b.textContent && b.textContent.trim() === 'Confirm Convert');
    if (confirmBtn) {
      confirmBtn.classList.add('my-custom-confirm-btn');
      return '.my-custom-confirm-btn';
    }
    return null;
  });

  if (btnSelector) {
    console.log('Clicking Confirm Convert...');
    await page.click(btnSelector);
    await new Promise(r => setTimeout(r, 6000));
    console.log('Done waiting for conversion.');
  } else {
    console.log('Confirm Convert button not found!');
  }

  await browser.close();
}

main().catch(console.error);
