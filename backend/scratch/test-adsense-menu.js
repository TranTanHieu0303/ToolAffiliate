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

  // Find all elements that look like links or menu items in the navigation area
  const navigation = await page.evaluate(() => {
    const items = [];
    // Select all elements matching potential nav items
    const elements = document.querySelectorAll('li, a, div[class*="nav"], div[class*="menu"], span[class*="menu"], span[class*="nav"]');
    elements.forEach(el => {
      const text = el.textContent ? el.textContent.trim() : '';
      const href = el.getAttribute('href') || '';
      const id = el.id || '';
      const className = el.className || '';
      if (text && text.length < 50 && (href || className.includes('menu') || className.includes('nav') || className.includes('item'))) {
        items.push({ text, href, id, className });
      }
    });
    return items;
  });

  console.log('Navigation / Menu items found:');
  console.log(JSON.stringify(navigation.slice(0, 50), null, 2));

  await browser.close();
}

main().catch(console.error);
