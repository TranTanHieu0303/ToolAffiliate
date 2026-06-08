const { PrismaClient } = require('@prisma/client');
const puppeteer = require('puppeteer');
const fs = require('fs');
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

  let index = 0;
  page.on('response', async response => {
    const url = response.url();
    if (url.includes('searchSkuOffer.json')) {
      index++;
      console.log(`Intercepted searchSkuOffer #${index} URL: ${url}`);
      try {
        const text = await response.text();
        const filePath = path.join(__dirname, `response_searchSkuOffer_${index}.json`);
        fs.writeFileSync(filePath, text, 'utf8');
        console.log(`Saved response to: ${filePath}`);
      } catch (e) {
        console.error(`Failed to save response #${index}:`, e.message);
      }
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

  console.log('Navigating to High Commission page...');
  await page.goto('https://adsense.lazada.vn/index.htm#!/hign_commission_offer/0/0/', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r => setTimeout(r, 12000));

  await browser.close();
}

main().catch(console.error);
