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

  // Close the popup modal
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
  await new Promise(r => setTimeout(r, 3000));

  const elementsInsideDialog = await page.evaluate(() => {
    const dialog = document.querySelector('.next-overlay-wrapper.opened');
    if (!dialog) return 'No open dialog found!';

    return Array.from(dialog.querySelectorAll('input, textarea, button, select, span, label'))
      .map(el => {
        return {
          tagName: el.tagName,
          type: el.getAttribute('type') || '',
          className: el.className || '',
          placeholder: el.getAttribute('placeholder') || '',
          value: el.value || '',
          text: el.textContent ? el.textContent.trim() : ''
        };
      })
      .filter(item => item.tagName === 'INPUT' || item.tagName === 'TEXTAREA' || item.tagName === 'BUTTON' || item.className.includes('btn') || item.text === 'Confirm Convert');
  });

  console.log('Elements inside active Link Convertor dialog:');
  console.log(JSON.stringify(elementsInsideDialog, null, 2));

  await browser.close();
}

main().catch(console.error);
