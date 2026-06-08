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

  const outerHTMLs = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'));
    const target = els.find(el => {
      const children = Array.from(el.childNodes);
      return children.some(node => node.nodeType === 3 && node.textContent.trim() === 'Link Convertor');
    });
    if (!target) return 'Not found';
    
    // Get target and its parent up to 3 levels
    const results = [];
    let curr = target;
    for (let i = 0; i < 4; i++) {
      if (!curr) break;
      results.push({
        tagName: curr.tagName,
        className: curr.className,
        outerHTML: curr.outerHTML.substring(0, 300) + '...'
      });
      curr = curr.parentElement;
    }
    return results;
  });

  console.log('HTML Ancestry of Link Convertor:');
  console.log(JSON.stringify(outerHTMLs, null, 2));

  await browser.close();
}

main().catch(console.error);
