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

  console.log('Clicking .link_convertor_header_title_box...');
  try {
    await page.click('.link_convertor_header_title_box');
    console.log('Clicked successfully.');
  } catch (e) {
    console.error('Failed to click:', e.message);
  }

  await new Promise(r => setTimeout(r, 3000));

  // Dump dialog containers
  const dialogHtmls = await page.evaluate(() => {
    return {
      linkConvertor: document.getElementById('link-convertor-dialog')?.outerHTML || 'null',
      inputLink: document.getElementById('input-link-dialog')?.outerHTML || 'null',
      bodyHtml: document.body.innerHTML.substring(0, 1000) // snippet of body
    };
  });

  console.log('Dialog HTMLs after click:');
  console.log(JSON.stringify(dialogHtmls, null, 2));

  // Check if textarea exists now
  const hasTextarea = await page.evaluate(() => !!document.querySelector('textarea'));
  console.log('Has textarea in DOM?', hasTextarea);

  await browser.close();
}

main().catch(console.error);
