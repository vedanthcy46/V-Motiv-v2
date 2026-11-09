// Turns REAL screenshots of the app into Google Play phone screenshots (1080x1920): a branded background, a short caption on top
// and the screenshot inside a phone-style frame.
//
//   1. Put your screenshots in  apps/customer-mobile/store-assets/screenshots-raw/   (PNG or JPG, e.g. 01-home.png, 02-cars.png)
//   2. Optionally edit the captions below (or add a screenshots-raw/captions.json: { "01-home.png": "Find your next car" })
//   3. node apps/customer-mobile/store-assets/frame-screenshots.cjs
//   Output: apps/customer-mobile/store-assets/phone/*.png  (upload these to Play Console -> Phone screenshots)
const fs = require('fs');
const path = require('path');
const sharp = require('../../../node_modules/sharp');

const rawDir = path.join(__dirname, 'screenshots-raw');
const outDir = path.join(__dirname, 'phone');
const W = 1080;
const H = 1920;
const GOLD = '#F7B503';

// Default captions by file order; replace with your own in captions.json (keyed by file name).
const DEFAULT_CAPTIONS = [
  'Find your next car',
  'Every car, inspected',
  'Rent a car in minutes',
  'Book your car service',
  'Pay securely, track every step',
  'Sell your car with ease',
  'Browse even offline',
  'Everything in one app',
];

const escapeXml = value => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch]));

/** Splits a caption into at most two lines of roughly equal length. */
function wrap(caption) {
  const words = caption.split(/\s+/);
  if (caption.length <= 22 || words.length < 3) return [caption];
  let best = [caption, ''];
  let gap = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    if (Math.abs(a.length - b.length) < gap) { gap = Math.abs(a.length - b.length); best = [a, b]; }
  }
  return best;
}

async function frame(file, caption, index) {
  // The screenshot goes inside a phone-shaped frame, 800 px wide, keeping its own proportions.
  const phoneW = 800;
  const bezel = 14;
  const innerW = phoneW - bezel * 2;
  const shot = await sharp(file).resize({ width: innerW }).png().toBuffer();
  const meta = await sharp(shot).metadata();
  const innerH = meta.height ?? 1600;
  const phoneH = innerH + bezel * 2;
  const radius = 64;

  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${innerW}" height="${innerH}"><rect width="${innerW}" height="${innerH}" rx="${radius - bezel}" fill="#fff"/></svg>`);
  const rounded = await sharp(shot).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  const body = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${phoneW}" height="${phoneH}"><rect width="${phoneW}" height="${phoneH}" rx="${radius}" fill="#0B0F19"/><rect x="2" y="2" width="${phoneW - 4}" height="${phoneH - 4}" rx="${radius - 2}" fill="none" stroke="#3A4256" stroke-width="3"/></svg>`);
  const phone = await sharp(body).composite([{ input: rounded, left: bezel, top: bezel }]).png().toBuffer();

  const lines = wrap(caption);
  const captionSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#04122B"/><stop offset="0.65" stop-color="#0A2552"/><stop offset="1" stop-color="#0E3170"/></linearGradient>
      <radialGradient id="glow" cx="0.5" cy="0.95" r="0.7"><stop offset="0" stop-color="#1C4FA8" stop-opacity="0.5"/><stop offset="1" stop-color="#1C4FA8" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/><rect width="${W}" height="${H}" fill="url(#glow)"/>
    <polygon points="${W},${H - 380} ${W},${H} ${W - 520},${H}" fill="${GOLD}" opacity="0.92"/>
    <text x="${W / 2}" y="112" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="700" letter-spacing="8" fill="${GOLD}">V MOTIV</text>
    ${lines.map((line, i) => `<text x="${W / 2}" y="${205 + i * 84}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="74" font-weight="800" fill="#FFFFFF">${escapeXml(line)}</text>`).join('')}
  </svg>`;

  // Fit the phone into the space under the caption; it may run off the bottom edge a little, like a real device mock-up.
  const top = lines.length > 1 ? 400 : 330;
  const maxVisible = H - top + 60;
  const phoneFitted = phoneH > maxVisible ? await sharp(phone).extract({ left: 0, top: 0, width: phoneW, height: maxVisible }).png().toBuffer() : phone;
  const name = `${String(index + 1).padStart(2, '0')}-${path.basename(file, path.extname(file)).replace(/^\d+-?/, '') || 'screen'}.png`;
  await sharp(Buffer.from(captionSvg)).composite([{ input: phoneFitted, left: Math.round((W - phoneW) / 2), top }]).flatten({ background: '#04122B' }).removeAlpha().png().toFile(path.join(outDir, name));
  return name;
}

(async () => {
  if (!fs.existsSync(rawDir)) fs.mkdirSync(rawDir, { recursive: true });
  const files = fs.readdirSync(rawDir).filter(f => /\.(png|jpe?g)$/i.test(f)).sort();
  if (files.length === 0) {
    console.log(`No screenshots found in ${rawDir}.\nAdd your real app screenshots there (PNG/JPG, e.g. 01-home.png) and run this again.`);
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  const captionsFile = path.join(rawDir, 'captions.json');
  const custom = fs.existsSync(captionsFile) ? JSON.parse(fs.readFileSync(captionsFile, 'utf8')) : {};
  for (let i = 0; i < files.length; i += 1) {
    const caption = custom[files[i]] ?? DEFAULT_CAPTIONS[i % DEFAULT_CAPTIONS.length];
    console.log('wrote', await frame(path.join(rawDir, files[i]), caption, i), '-', caption);
  }
})().catch(error => { console.error(error); process.exit(1); });
