const { PrismaClient } = require('@prisma/client');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function main() {
  const prisma = new PrismaClient();
  const config = await prisma.systemConfig.findUnique({ where: { id: 'default' } });
  await prisma.$disconnect();

  if (!config || !config.lazadaCookie) {
    console.error('No Lazada cookie found in database');
    process.exit(1);
  }

  console.log('Lazada Cookie length:', config.lazadaCookie.length);

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // Replicate cookie across Lazada subdomains
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

  console.log('Navigating to adsense.lazada.vn...');
  await page.goto('https://adsense.lazada.vn/', { waitUntil: 'networkidle2', timeout: 60000 });

  const currentUrl = page.url();
  console.log('Current URL:', currentUrl);

  const title = await page.title();
  console.log('Page Title:', title);

  // Capture screenshot to check visual state
  const screenshotPath = path.join(__dirname, 'adsense_screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Screenshot saved to:', screenshotPath);

  // Print some visible texts to identify login status
  const textContent = await page.evaluate(() => document.body.textContent || '');
  console.log('Is Logged In (has dashboard/username/logout)?');
  console.log('Contains "Đăng nhập":', textContent.includes('Đăng nhập'));
  console.log('Contains "Dashboard":', textContent.includes('Dashboard') || textContent.includes('Trang chủ'));
  console.log('Contains "Báo cáo":', textContent.includes('Báo cáo') || textContent.includes('Report'));
  
  // Dump some key links or button texts
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a, button'))
      .map(el => ({
        tag: el.tagName,
        text: el.textContent ? el.textContent.trim() : '',
        href: el.getAttribute('href') || ''
      }))
      .filter(item => item.text.length > 0)
      .slice(0, 30);
  });
  console.log('Links & Buttons found:', JSON.stringify(links, null, 2));

  await browser.close();
}

main().catch(console.error);
