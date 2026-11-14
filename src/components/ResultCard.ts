/**
 * The shareable result card: a 1200 x 630 PNG with the headline, the three answers and the
 * island. It travels without its page, so the island and the footer say plainly it is fiction.
 */

import { CATCH_PLACE, type ElectionResult } from '../../engine';

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
  const colors = ['#9085e9', '#199e70', '#c98500', '#d55181', '#0ca30c'];
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = ink;
  ctx.font = '600 20px "JetBrains Mono", monospace';
  ctx.fillText('MUDWICK ISLE ELECTION FRAUD SIMULATOR', 56, 70);

  ctx.fillStyle = text;
  ctx.font = '800 48px "Bricolage Grotesque", sans-serif';
  const lines = wrap(ctx, r.headline.text, 640).slice(0, 5);
  lines.forEach((l, i) => ctx.fillText(l, 56, 140 + i * 56));

  const h = r.headline;
  const answers: Array<[string, string, string]> = [
    ['Flipped?', h.flipped ? 'Yes' : 'No', h.flipped ? bad : good],
    ['Caught?', !h.attempted ? 'Clean' : h.caught ? 'Yes' : 'No', !h.attempted ? muted : h.caught ? good : bad],
    ['Where?', h.caughtAt ? (CATCH_PLACE[h.caughtAt.via] ?? '').replace(/^(at|in|by) (the )?/, '') : '—', text],
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
    ctx.font = '800 30px "Bricolage Grotesque", sans-serif';
    ctx.fillText(a.length > 12 ? `${a.slice(0, 11)}…` : a, x + 18, y + 74);
  });

  // The island, coloured by certified result per precinct; tampered places outlined.
  const box = { x: 740, y: 96, w: 404, h: 404 };
  ctx.fillStyle = '#0b1c22';
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, 18);
  ctx.fill();
  const cell = Math.min((box.w - 40) / r.cols, (box.h - 40) / r.rows);
  const ox = box.x + (box.w - cell * r.cols) / 2, oy = box.y + (box.h - cell * r.rows) / 2;
  for (const p of r.precincts) {
    const row = p.reported;
    const j = row.indexOf(Math.max(...row));
    const x = ox + p.static.col * cell, y = oy + p.static.row * cell;
    ctx.fillStyle = colors[j % 5];
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    ctx.globalAlpha = 1;
    if (p.tampered.length) {
      ctx.strokeStyle = bad;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
    }
  }
  ctx.fillStyle = muted;
  ctx.font = '600 14px "JetBrains Mono", monospace';
  ctx.fillText('MUDWICK ISLE', box.x + 16, box.y + 26);

  const names = r.config.candidates.map((c) => c.name);
  ctx.font = '500 16px "Plus Jakarta Sans", sans-serif';
  let lx = box.x;
  const shown = names.slice(0, 3);
  const room = box.w / shown.length - 40;
  shown.forEach((n, k) => {
    ctx.fillStyle = colors[k];
    ctx.fillRect(lx, box.y + box.h + 18, 12, 12);
    ctx.fillStyle = text;
    let label = n;
    while (ctx.measureText(label).width > room && label.length > 4) label = label.slice(0, -1);
    if (label !== n) label = `${label.slice(0, -1)}…`;
    ctx.fillText(label, lx + 18, box.y + box.h + 29);
    lx += box.w / shown.length;
  });

  ctx.fillStyle = muted;
  ctx.font = '500 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(`Mudwick Isle is a fictional goblin island. Seed ${r.config.seed}. Run it yourself at goblinlife.org/democracy`, 56, 592);
  return canvas.toDataURL('image/png');
}
