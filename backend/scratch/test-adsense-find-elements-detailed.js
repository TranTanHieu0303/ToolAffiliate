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

  console.log('Locating "Link Convertor" element...');
  // Let's find elements containing "Link Convertor" text
  const targetSelector = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'));
    // Find direct element containing the text
    const target = els.find(el => {
      const children = Array.from(el.childNodes);
      return children.some(node => node.nodeType === 3 && node.textContent.trim() === 'Link Convertor');
    });
    if (target) {
      // Find the class or generate a unique selector
      target.classList.add('my-custom-click-target');
      return '.my-custom-click-target';
    }
    return null;
  });

  console.log('Target selector:', targetSelector);
  if (targetSelector) {
    await page.click(targetSelector);
    console.log('Clicked target.');
  } else {
    console.log('Target not found!');
  }

  console.log('Waiting for textarea...');
  try {
    await page.waitForSelector('textarea', { timeout: 10000 });
    console.log('Textarea loaded!');

    // Type the URL
    await page.type('textarea', 'https://www.lazada.vn/products/i13395072524.html');
    console.log('Typed URL.');

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

    console.log('Confirm button selector:', btnSelector);
    if (btnSelector) {
      await page.click(btnSelector);
      console.log('Clicked Confirm Convert.');
      await new Promise(r => setTimeout(r, 6000));

      // Check results
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

      console.log('Converted link results:', JSON.stringify(results, null, 2));
    } else {
      console.log('Confirm button not found!');
    }
  } catch (e) {
    console.error('Failed or timed out waiting for elements:', e.message);
  }

  await browser.close();
}

main().catch(console.error);
