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

  console.log('Closing popup modal...');
  await page.evaluate(() => {
    const closeBtn = document.querySelector('a.next-dialog-close');
    if (closeBtn) closeBtn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  console.log('Clicking .link_convertor_header_title_box via JS evaluate...');
  const jsClicked = await page.evaluate(() => {
    const el = document.querySelector('.link_convertor_header_title_box');
    if (el) {
      el.click();
      return true;
    }
    return false;
  });
  console.log('JS click successful?', jsClicked);

  await new Promise(r => setTimeout(r, 4000));

  // Check if textarea exists now
  const hasTextarea = await page.evaluate(() => {
    const ta = document.querySelector('textarea');
    if (ta) {
      return {
        placeholder: ta.getAttribute('placeholder') || '',
        outerHTML: ta.outerHTML.substring(0, 200)
      };
    }
    return null;
  });
  console.log('Textarea element:', hasTextarea);

  // Take a screenshot of the state
  const screenshotPath = path.join(__dirname, 'adsense_js_click_state.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved to:', screenshotPath);

  await browser.close();
}

main().catch(console.error);
