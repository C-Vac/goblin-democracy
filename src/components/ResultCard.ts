/**
 * The shareable result card: a 1200 x 630 PNG with the headline, the three answers and the
 * island. It travels without its page, so the island and the footer say plainly it is fiction.
 */

import { ASPECT, CATCH_SHORT, DISTRICTS, type ElectionResult } from '../../engine';
import { loadMapArt } from '../mapArt';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export async function drawResultCard(r: ElectionResult): Promise<string> {
  await document.fonts?.ready;
  const W = 1200, H = 630;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  // Always the dark brand look, whatever the viewer's theme.
  const bg = '#0e1510', surface = '#142018', text = '#ecf2ed', muted = '#8b9c8f', ink = '#74e88c', bad = '#ff7a6b', good = '#3ccf63';
  const PARTY_HEX: Record<string, string> = { council: '#9085e9', gallery: '#118660', independent: '#cc7a12', 'minor-a': '#e05a9a', 'minor-b': '#3a9ed0' };
  const colors = r.config.candidates.map((c) => PARTY_HEX[c.party] ?? '#8b9c8f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = ink;
  ctx.font = '600 20px "JetBrains Mono", monospace';
  ctx.fillText('MUDWICK ISLE ELECTION FRAUD SIMULATOR', 56, 70);

  ctx.fillStyle = text;
  ctx.font = '800 48px "Bricolage Grotesque", sans-serif';
  const lines = wrap(ctx, r.headline.text, 610).slice(0, 5);
  lines.forEach((l, i) => ctx.fillText(l, 56, 140 + i * 56));

  const h = r.headline;
  const answers: Array<[string, string, string]> = [
    ['Flipped?', h.flipped ? 'Yes' : 'No', h.flipped ? bad : good],
    ['Caught?', !h.attempted ? 'Clean' : h.caught ? 'Yes' : 'No', !h.attempted ? muted : h.caught ? good : bad],
    ['Where?', h.caughtAt ? (CATCH_SHORT[h.caughtAt.via] ?? 'Caught') : '—', text],
  ];
  answers.forEach(([q, a, c], i) => {
    const x = 56 + i * 215, y = 440;
    ctx.fillStyle = surface;
    ctx.beginPath();
    ctx.roundRect(x, y, 200, 96, 14);
    ctx.fill();
    ctx.fillStyle = muted;
    ctx.font = '500 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(q, x + 18, y + 32);
    ctx.fillStyle = c;
    ctx.font = `800 ${a.length > 9 ? 24 : 30}px "Bricolage Grotesque", sans-serif`;
    ctx.fillText(a, x + 18, y + 74, 164);
  });

  // The island: the painted map, each polling place coloured by its certified leader, tampered places outlined.
  const box = { x: 712, y: 112, w: 440, h: Math.round(440 / ASPECT) };
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, 14);
  ctx.clip();
  ctx.fillStyle = '#0b1c22';
  ctx.fillRect(box.x, box.y, box.w, box.h);
  const art = await loadImage((await loadMapArt()).canvasUrl);
  if (art) ctx.drawImage(art, box.x, box.y, box.w, box.h);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(box.x, box.y, box.w, box.h);
  const px = (x: number) => box.x + (x / 100) * box.w, py = (y: number) => box.y + (y / 100) * box.h;
  const cw = (r.cw / 100) * box.w, ch = (r.ch / 100) * box.h;
  for (const p of r.precincts) {
    const row = p.reported;
    const j = row.indexOf(Math.max(...row));
    const x = px(p.static.x) - cw / 2, y = py(p.static.y) - ch / 2;
    ctx.fillStyle = colors[j];
    ctx.globalAlpha = 0.8;
    ctx.fillRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
    ctx.globalAlpha = 1;
    if (p.tampered.length) {
      ctx.strokeStyle = bad;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 1, y + 1, cw - 2, ch - 2);
    }
  }
  for (const d of DISTRICTS) {
    if (!r.nodes.some((n) => n.district === d.id)) continue;
    const outline = new Path2D();
    d.poly.forEach(([x, y], k) => (k ? outline.lineTo(px(x), py(y)) : outline.moveTo(px(x), py(y))));
    outline.closePath();
    ctx.strokeStyle = 'rgba(244,234,210,0.8)';
    ctx.lineWidth = 1;
    ctx.setLineDash(d.offMap ? [4, 3] : []);
    ctx.stroke(outline);
  }
  ctx.setLineDash([]);
  ctx.restore();
  ctx.fillStyle = muted;
  ctx.font = '600 14px "JetBrains Mono", monospace';
  ctx.fillText('MUDWICK ISLE', box.x, box.y - 12);

  const names = r.config.candidates.map((c) => c.name);
  ctx.font = '500 16px "Plus Jakarta Sans", sans-serif';
  let lx = box.x;
  const shown = names.slice(0, 3);
  const room = box.w / shown.length - 40;
  shown.forEach((n, k) => {
    ctx.fillStyle = colors[k];
    ctx.fillRect(lx, box.y + box.h + 22, 12, 12);
    ctx.fillStyle = text;
    let label = n;
    while (ctx.measureText(label).width > room && label.length > 4) label = label.slice(0, -1);
    if (label !== n) label = `${label.slice(0, -1)}…`;
    ctx.fillText(label, lx + 18, box.y + box.h + 33);
    lx += box.w / shown.length;
  });

  ctx.fillStyle = muted;
  ctx.font = '500 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`Mudwick Isle is a fictional goblin island. Seed ${r.config.seed}. Run it yourself at goblinlife.org/democracy`, 56, 592);
  return canvas.toDataURL('image/png');
}
