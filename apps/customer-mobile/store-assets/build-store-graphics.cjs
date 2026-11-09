// Builds the Google Play listing graphics from the app's own logo.
//   node apps/customer-mobile/store-assets/build-store-graphics.cjs
// Output (next to this file): play-icon-512.png (512x512) and feature-graphic-1024x500.png (1024x500, no transparency).
const path = require('path');
const sharp = require('../../../node_modules/sharp');

const assets = path.join(__dirname, '..', 'assets');
const out = file => path.join(__dirname, file);
const NAVY = '#061A38';
const GOLD = '#F7B503';

async function playIcon() {
  // The app icon has generous padding; crop in so the mark fills the store icon, then flatten to a solid square (Play rounds the corners itself).
  await sharp(path.join(assets, 'icon.png'))
    .extract({ left: 132, top: 132, width: 760, height: 760 })
    .resize(512, 512)
    .flatten({ background: NAVY })
    .png()
    .toFile(out('play-icon-512.png'));
}

async function featureGraphic() {
  const W = 1024;
  const H = 500;
  // The logo with a transparent background, trimmed to the mark itself.
  const mark = await sharp(path.join(assets, 'android-icon-foreground.png')).trim().resize({ height: 176 }).png().toBuffer();
  const markMeta = await sharp(mark).metadata();

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#04122B"/>
        <stop offset="0.6" stop-color="#0A2552"/>
        <stop offset="1" stop-color="#0E3170"/>
      </linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FFC62E"/>
        <stop offset="1" stop-color="#F7B503"/>
      </linearGradient>
      <radialGradient id="glow" cx="0.2" cy="0.5" r="0.55">
        <stop offset="0" stop-color="#1C4FA8" stop-opacity="0.55"/>
        <stop offset="1" stop-color="#1C4FA8" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
    <!-- road-like diagonal accents on the right -->
    <polygon points="700,${H} 1024,${H} 1024,170" fill="#0B2C63" opacity="0.8"/>
    <polygon points="840,${H} 1024,${H} 1024,300" fill="url(#gold)" opacity="0.95"/>
    <polygon points="770,${H} 810,${H} 1024,225 1024,185" fill="#FFFFFF" opacity="0.10"/>

    <text x="372" y="150" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="26" font-weight="700" letter-spacing="6" fill="${GOLD}">V MOTIV</text>
    <text x="370" y="238" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="64" font-weight="800" fill="#FFFFFF">Your whole car</text>
    <text x="370" y="308" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="64" font-weight="800" fill="#FFFFFF">journey, <tspan fill="${GOLD}">one app.</tspan></text>

    <g font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="24" font-weight="700">
      <rect x="372" y="352" width="104" height="46" rx="23" fill="none" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="2"/>
      <text x="424" y="384" text-anchor="middle" fill="#FFFFFF">Buy</text>
      <rect x="488" y="352" width="104" height="46" rx="23" fill="none" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="2"/>
      <text x="540" y="384" text-anchor="middle" fill="#FFFFFF">Sell</text>
      <rect x="604" y="352" width="104" height="46" rx="23" fill="none" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="2"/>
      <text x="656" y="384" text-anchor="middle" fill="#FFFFFF">Rent</text>
      <rect x="720" y="352" width="130" height="46" rx="23" fill="none" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="2"/>
      <text x="785" y="384" text-anchor="middle" fill="#FFFFFF">Service</text>
    </g>
  </svg>`;

  const top = Math.round((H - (markMeta.height ?? 176)) / 2);
  await sharp(Buffer.from(svg))
    .composite([{ input: mark, left: 72, top }])
    .flatten({ background: NAVY })
    .removeAlpha()
    .png()
    .toFile(out('feature-graphic-1024x500.png'));
}

(async () => {
  await playIcon();
  await featureGraphic();
  for (const file of ['play-icon-512.png', 'feature-graphic-1024x500.png']) {
    const meta = await sharp(out(file)).metadata();
    console.log(file, `${meta.width}x${meta.height}`, meta.hasAlpha ? 'has alpha' : 'no alpha');
  }
})().catch(error => { console.error(error); process.exit(1); });
