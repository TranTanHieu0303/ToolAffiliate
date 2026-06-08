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

  // Close popup modal
  await page.evaluate(() => {
    const btn = document.querySelector('a.next-dialog-close');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // Click Link Convertor
  await page.evaluate(() => {
    const el = document.querySelector('.link_convertor_header_title_box');
    if (el) el.click();
  });

  console.log('Waiting for URL input...');
  const inputSelector = 'input[placeholder="Paste page url here"]';
  await page.waitForSelector(inputSelector, { timeout: 10000 });
  console.log('Input found. Typing URL...');
  await page.type(inputSelector, 'https://www.lazada.vn/products/i13395072524.html');

  console.log('Clicking Confirm Convert...');
  const btnSelector = 'button.link-convert-confirm';
  await page.click(btnSelector);

  console.log('Waiting for result...');
  await new Promise(r => setTimeout(r, 5000));

  // Screenshot
  const screenshotPath = path.join(__dirname, 'adsense_converted_final.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved to:', screenshotPath);

  // Dump all dialog innerHTML to inspect results
  const results = await page.evaluate(() => {
    const bodies = [];
    document.querySelectorAll('.next-overlay-wrapper.opened').forEach((el, idx) => {
      bodies.push({
        index: idx,
        text: el.textContent ? el.textContent.trim() : '',
        html: el.innerHTML
      });
    });
    
    // Check all inputs
    const inputs = Array.from(document.querySelectorAll('input, textarea'))
      .map(el => ({
        placeholder: el.getAttribute('placeholder') || '',
        value: el.value || ''
      }));

    return { bodies, inputs };
  });

  console.log('Final dialog contents:');
  console.log(JSON.stringify(results, null, 2));

  await browser.close();
}

main().catch(console.error);
