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
  await new Promise(r => setTimeout(r, 4000));

  console.log('Clicking "Link Convertor"...');
  const clicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'));
    // Find elements with text "Link Convertor"
    const target = els.find(el => {
      const children = Array.from(el.childNodes);
      const hasDirectText = children.some(node => node.nodeType === 3 && node.textContent.trim() === 'Link Convertor');
      return hasDirectText;
    });
    if (target) {
      target.click();
      return true;
    }
    return false;
  });

  console.log('Clicked successfully?', clicked);
  await new Promise(r => setTimeout(r, 5000));

  const currentUrl = page.url();
  console.log('URL after clicking Link Convertor:', currentUrl);

  const screenshotPath = path.join(__dirname, 'adsense_convertor.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved to:', screenshotPath);

  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, textarea, select, button'))
      .map(el => ({
        tag: el.tagName,
        type: el.getAttribute('type') || '',
        id: el.getAttribute('id') || '',
        className: el.className || '',
        placeholder: el.getAttribute('placeholder') || '',
        value: el.value || '',
        text: el.textContent ? el.textContent.trim() : ''
      }));
  });

  console.log('Interactive elements on Convertor page:');
  console.log(JSON.stringify(inputs, null, 2));

  await browser.close();
}

main().catch(console.error);
