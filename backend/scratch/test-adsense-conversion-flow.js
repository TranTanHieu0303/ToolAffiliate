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
  await new Promise(r => setTimeout(r, 4000));

  console.log('Clicking "Link Convertor"...');
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'));
    const target = els.find(el => {
      const children = Array.from(el.childNodes);
      return children.some(node => node.nodeType === 3 && node.textContent.trim() === 'Link Convertor');
    });
    if (target) target.click();
  });

  await new Promise(r => setTimeout(r, 3000));

  console.log('Entering link to convert...');
  const conversionDone = await page.evaluate(() => {
    const textarea = document.querySelector('textarea[placeholder*="links convert"]');
    if (textarea) {
      textarea.value = 'https://www.lazada.vn/products/i13395072524.html';
      // Trigger change/input events for framework listeners
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));

      // Find Confirm Convert button
      const buttons = Array.from(document.querySelectorAll('button'));
      const confirmBtn = buttons.find(b => b.textContent && b.textContent.trim() === 'Confirm Convert');
      if (confirmBtn) {
        confirmBtn.click();
        return true;
      }
    }
    return false;
  });

  console.log('Triggered conversion?', conversionDone);
  await new Promise(r => setTimeout(r, 6000));

  // Capture screenshot of results
  const screenshotPath = path.join(__dirname, 'adsense_converted_result.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log('Result screenshot saved to:', screenshotPath);

  // Search DOM for s.lazada.vn short links
  const links = await page.evaluate(() => {
    // Try to find any text content matching s.lazada.vn
    const bodyText = document.body.textContent || '';
    const matches = bodyText.match(/https:\/\/s\.lazada\.vn\/s\.[a-zA-Z0-9]+/g);
    
    // Also try to find inputs containing s.lazada.vn
    const inputVals = Array.from(document.querySelectorAll('input, textarea'))
      .map(el => el.value || '')
      .filter(val => val.includes('s.lazada.vn'));

    return {
      allMatches: matches ? Array.from(new Set(matches)) : [],
      inputVals: Array.from(new Set(inputVals))
    };
  });

  console.log('Found converted links:', JSON.stringify(links, null, 2));

  await browser.close();
}

main().catch(console.error);
