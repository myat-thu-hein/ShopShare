/**
 * Generates simple, consistent SVG product illustrations for the demo catalogue.
 * They ship as static files in apps/web/public/demo so the demo works offline and on any host.
 * Run: pnpm --filter @shopsense/api exec tsx prisma/demo-images.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { slugify } from '@shopsense/shared';
import { SEED_PRODUCTS, type Kind } from './seed-data';

export const COLOUR_HEX: Record<string, string> = {
  black: '#27272a',
  white: '#f4f4f5',
  grey: '#9ca3af',
  red: '#e11d48',
  blue: '#2563eb',
  navy: '#1e3a8a',
  green: '#16a34a',
  yellow: '#facc15',
  orange: '#f97316',
  pink: '#f472b6',
  purple: '#9333ea',
  brown: '#92400e',
  beige: '#d6c3a5',
  silver: '#cbd5e1',
  gold: '#d4a017',
};

const SHAPES: Record<Kind, string> = {
  shoe: `<path d="M140 520 C140 440 220 420 270 405 L345 315 C365 290 410 292 430 318 L515 410 C600 430 680 450 690 515 L690 545 L140 545 Z"/>
    <rect x="130" y="545" width="575" height="45" rx="20" class="d"/>
    <path d="M360 350 l40 40 M385 330 l40 40 M335 375 l40 40" class="l"/>`,
  tshirt: `<path d="M280 210 L355 180 C375 230 425 230 445 180 L520 210 L630 300 L575 370 L520 335 L520 610 L280 610 L280 335 L225 370 L170 300 Z"/>`,
  jacket: `<path d="M285 200 L360 175 L400 230 L440 175 L515 200 L600 290 L640 600 L570 610 L540 360 L530 620 L270 620 L260 360 L230 610 L160 600 L200 290 Z"/>
    <path d="M400 230 L400 620" class="l"/>`,
  dress: `<path d="M345 180 L455 180 L470 300 L590 620 L210 620 L330 300 Z"/><path d="M330 300 L470 300" class="l"/>`,
  laptop: `<rect x="220" y="210" width="360" height="240" rx="18"/>
    <rect x="245" y="235" width="310" height="190" rx="8" class="s"/>
    <path d="M160 470 L640 470 L600 540 L200 540 Z" class="d"/>`,
  headphones: `<path d="M230 470 C230 260 570 260 570 470" fill="none" class="t"/>
    <rect x="190" y="420" width="90" height="160" rx="40"/><rect x="520" y="420" width="90" height="160" rx="40"/>`,
  phone: `<rect x="295" y="150" width="210" height="440" rx="34"/><rect x="315" y="190" width="170" height="350" rx="12" class="s"/>
    <circle cx="400" cy="170" r="7" class="d"/>`,
  watch: `<rect x="350" y="150" width="100" height="500" rx="30" class="d"/><circle cx="400" cy="400" r="125"/>
    <circle cx="400" cy="400" r="95" class="s"/><path d="M400 400 L400 340 M400 400 L445 420" class="l"/>`,
  speaker: `<rect x="250" y="220" width="300" height="370" rx="60"/><circle cx="400" cy="460" r="80" class="s"/>
    <circle cx="400" cy="310" r="35" class="s"/>`,
  mug: `<rect x="250" y="260" width="250" height="300" rx="30"/>
    <path d="M500 320 C600 320 600 480 500 480" fill="none" class="t"/>`,
  pan: `<circle cx="340" cy="420" r="175"/><circle cx="340" cy="420" r="135" class="s"/>
    <rect x="500" y="395" width="230" height="50" rx="25" class="d"/>`,
  lamp: `<path d="M290 200 L510 200 L570 400 L230 400 Z"/><rect x="385" y="400" width="30" height="160" class="d"/>
    <rect x="300" y="560" width="200" height="40" rx="18" class="d"/>`,
  pillow: `<path d="M210 260 C300 220 500 220 590 260 C630 360 630 460 590 560 C500 600 300 600 210 560 C170 460 170 360 210 260 Z"/>`,
  bottle: `<rect x="355" y="150" width="90" height="70" rx="12" class="d"/>
    <path d="M330 230 L470 230 C510 260 520 300 520 340 L520 600 C520 625 500 640 475 640 L325 640 C300 640 280 625 280 600 L280 340 C280 300 290 260 330 230 Z"/>
    <rect x="300" y="380" width="200" height="110" rx="10" class="s"/>`,
  tube: `<path d="M300 180 L500 180 L470 560 L330 560 Z"/><rect x="345" y="560" width="110" height="70" rx="14" class="d"/>
    <rect x="330" y="300" width="140" height="120" rx="10" class="s"/>`,
  dumbbell: `<rect x="250" y="380" width="300" height="40" rx="18" class="d"/>
    <rect x="170" y="300" width="80" height="200" rx="18"/><rect x="550" y="300" width="80" height="200" rx="18"/>
    <rect x="130" y="330" width="40" height="140" rx="12"/><rect x="630" y="330" width="40" height="140" rx="12"/>`,
  tent: `<path d="M400 190 L660 590 L140 590 Z"/><path d="M400 330 L470 590 L330 590 Z" class="s"/>`,
  backpack: `<rect x="250" y="210" width="300" height="400" rx="70"/><rect x="300" y="420" width="200" height="140" rx="30" class="s"/>
    <path d="M330 210 C330 140 470 140 470 210" fill="none" class="t"/>`,
  mat: `<rect x="180" y="330" width="440" height="170" rx="85"/><ellipse cx="620" cy="415" rx="55" ry="85" class="s"/>`,
};

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export function productSvg(kind: Kind, colour: string | undefined, label: string): string {
  const base = COLOUR_HEX[colour ?? ''] ?? '#6366f1';
  const isLight = ['white', 'silver', 'beige', 'yellow'].includes(colour ?? '');
  const dark = shade(base, isLight ? -90 : -60);
  const bg1 = shade(base, isLight ? -20 : 150);
  const bg2 = shade(base, isLight ? -45 : 110);
  const safeLabel = label.replace(/[<>&"]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" role="img" aria-label="${safeLabel}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
    <style>
      .p{fill:${base};stroke:${dark};stroke-width:8;stroke-linejoin:round}
      .p .d{fill:${dark}} .p .s{fill:${shade(base, 50)};stroke:${dark}}
      .p .l{fill:none;stroke:${dark};stroke-width:10;stroke-linecap:round}
      .p .t{fill:none;stroke:${base};stroke-width:42;stroke-linecap:round}
    </style>
  </defs>
  <rect width="800" height="800" fill="url(#bg)"/>
  <ellipse cx="400" cy="660" rx="260" ry="28" fill="#000" opacity="0.08"/>
  <g class="p">${SHAPES[kind]}</g>
</svg>`;
}

export function demoImagePaths(title: string, colours: string[]): string[] {
  const slug = slugify(title);
  const count = Math.min(Math.max(colours.length, 1), 3);
  return Array.from({ length: count }, (_, i) => `/demo/products/${slug}-${i + 1}.svg`);
}

if (require.main === module) {
  const out = join(__dirname, '../../web/public/demo/products');
  mkdirSync(out, { recursive: true });
  let n = 0;
  for (const p of SEED_PRODUCTS) {
    demoImagePaths(p.title, p.colours).forEach((path, i) => {
      writeFileSync(join(out, path.split('/').pop()!), productSvg(p.kind, p.colours[i], p.title));
      n++;
    });
  }
  console.log(`Wrote ${n} demo images to ${out}`);
}
