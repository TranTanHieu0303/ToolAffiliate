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

  console.log('Initially, does .next-overlay-wrapper exist?', await page.evaluate(() => !!document.querySelector('.next-overlay-wrapper')));

  // Close the dialog
  const closed = await page.evaluate(() => {
    const btn = document.querySelector('a.next-dialog-close');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  console.log('Click close button result:', closed);

  await new Promise(r => setTimeout(r, 2000));
  console.log('After close click, does .next-overlay-wrapper exist?', await page.evaluate(() => !!document.querySelector('.next-overlay-wrapper')));

  console.log('Clicking Link Convertor...');
  await page.evaluate(() => {
    const el = document.querySelector('.link_convertor_header_title_box');
    if (el) el.click();
  });

  await new Promise(r => setTimeout(r, 3000));
  console.log('After Link Convertor click, does .next-overlay-wrapper exist?', await page.evaluate(() => !!document.querySelector('.next-overlay-wrapper')));
  
  const activeDialogContent = await page.evaluate(() => {
    const wrapper = document.querySelector('.next-overlay-wrapper.opened');
    return wrapper ? wrapper.textContent.trim().substring(0, 500) : 'None';
  });
  console.log('Active dialog text:', activeDialogContent);

  await browser.close();
}

main().catch(console.error);
