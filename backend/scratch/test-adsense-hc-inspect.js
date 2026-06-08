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

  await page.goto('https://adsense.lazada.vn/index.htm#!/hign_commission_offer/0/0/', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 8000));

  // Close popup modal if any
  await page.evaluate(() => {
    const btn = document.querySelector('a.next-dialog-close');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  const pageDetails = await page.evaluate(() => {
    const texts = [];
    document.querySelectorAll('*').forEach(el => {
      const text = el.textContent ? el.textContent.trim() : '';
      if (text && text.length > 0 && text.length < 100 && (el.className.includes('title') || el.className.includes('price') || el.className.includes('commission') || el.className.includes('offer') || el.className.includes('item'))) {
        texts.push({ tag: el.tagName, className: el.className, text });
      }
    });
    return {
      bodyTextSnippet: document.body.textContent ? document.body.textContent.trim().substring(0, 1000) : '',
      elements: texts.slice(0, 50)
    };
  });

  console.log('Page details:');
  console.log(JSON.stringify(pageDetails, null, 2));

  await browser.close();
}

main().catch(console.error);
