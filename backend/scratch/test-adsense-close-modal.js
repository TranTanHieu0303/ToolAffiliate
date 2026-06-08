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

  console.log('Checking for popup modal...');
  const closedModal = await page.evaluate(() => {
    const closeBtn = document.querySelector('a.next-dialog-close');
    if (closeBtn) {
      closeBtn.click();
      return true;
    }
    return false;
  });
  console.log('Closed popup modal?', closedModal);
  if (closedModal) {
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('Locating "Link Convertor" element...');
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
    console.log('Clicking Link Convertor...');
    await page.click(targetSelector);
  } else {
    console.error('Link Convertor element not found!');
    await browser.close();
    return;
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

    // Capture screenshot of results
    const resultScreenshotPath = path.join(__dirname, 'adsense_conversion_success.png');
    await page.screenshot({ path: resultScreenshotPath, fullPage: true });
    console.log('Result screenshot saved to:', resultScreenshotPath);

    // Search DOM for s.lazada.vn short links
    const results = await page.evaluate(() => {
      const bodyText = document.body.textContent || '';
      const matches = bodyText.match(/https:\/\/s\.lazada\.vn\/s\.[a-zA-Z0-9]+/g);
      const inputVals = Array.from(document.querySelectorAll('input, textarea'))
        .map(el => el.value || '')
        .filter(val => val.includes('s.lazada.vn'));
      return {
        matches: matches ? Array.from(new Set(matches)) : [],
        inputs: Array.from(new Set(inputVals))
      };
    });

    console.log('Conversion results:', JSON.stringify(results, null, 2));
  } else {
    console.log('Confirm Convert button not found!');
  }

  await browser.close();
}

main().catch(console.error);
