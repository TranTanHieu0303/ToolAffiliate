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

  console.log('Interactive elements found on homepage:');
  console.log(JSON.stringify(inputs, null, 2));

  await browser.close();
}

main().catch(console.error);
