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

  console.log('Clicking "Offer" menu to expand...');
  await page.evaluate(() => {
    // Find div role="listitem" with title "adsense.menu.offer"
    const offerMenu = document.querySelector('div[title="adsense.menu.offer"]');
    if (offerMenu) {
      offerMenu.click();
    }
  });

  await new Promise(r => setTimeout(r, 3000));

  // Capture screenshot of expanded menu
  const screenshotPath = path.join(__dirname, 'adsense_offer_expanded.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved to:', screenshotPath);

  // Print all menu items text
  const menuItems = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.next-menu-item, .next-menu-item-text'))
      .map(el => ({
        text: el.textContent ? el.textContent.trim() : '',
        className: el.className || '',
        title: el.getAttribute('title') || '',
        href: el.getAttribute('href') || ''
      }))
      .filter(item => item.text.length > 0 && item.text.length < 50);
  });

  console.log('Menu items after expanding Offer:');
  console.log(JSON.stringify(menuItems, null, 2));

  await browser.close();
}

main().catch(console.error);
