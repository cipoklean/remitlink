// One-off generator for the /claim Open Graph thumbnail.
// Outputs public/og-claim.png (1200x630). Re-run from repo root:
//   node scripts/make-og-image.mjs
// Brand-matched to the app: cream #F9F7F2, teal accent #0F766E, serif wordmark.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "..", "public", "og-claim.png");

const W = 1200;
const H = 630;
const M = 96; // left/right margin

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#F9F7F2"/>
  <rect x="0" y="0" width="8" height="${H}" fill="#0F766E"/>
  <!-- wordmark -->
  <text x="${M}" y="150" font-family="'DejaVu Serif', serif" font-size="40" font-weight="bold" fill="#1C1917">RemitLink</text>
  <text x="${M}" y="205" font-family="'DejaVu Sans', sans-serif" font-size="22" fill="#57534E">United States → Nigeria</text>
  <!-- headline -->
  <text x="${M}" y="360" font-family="'DejaVu Serif', serif" font-size="88" font-weight="bold" fill="#1C1917">You received money</text>
  <text x="${M}" y="440" font-family="'DejaVu Sans', sans-serif" font-size="34" fill="#57534E">Claim it with your passkey — no account, no forms.</text>
  <!-- footer pill -->
  <rect x="${M}" y="500" rx="999" width="430" height="56" fill="#0F766E"/>
  <text x="${M + 28}" y="536" font-family="'DejaVu Sans', sans-serif" font-size="24" fill="#F9F7F2">Tap to claim on RemitLink</text>
</svg>`;

await mkdir(path.dirname(out), { recursive: true });
const buf = await sharp(Buffer.from(svg)).png().toBuffer();
await writeFile(out, buf);
console.log(`wrote ${out} (${buf.length} bytes, ${W}x${H})`);
