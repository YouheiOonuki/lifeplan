// 印刷 A4 2 枚の CSS が、画面の規則に負けていないか（Q-369、yorozu-plans の QUEUE 2026-11-18 昼）。
// 印刷の規則が表の規則（字の大きさ・余白）より前にあると、同じ詳細度で画面の側が勝ち、表が 3〜4 枚に延びた。
// 紙の枚数そのものは Playwright の page.pdf() で測った（BUILDLOG）。ここは並びと、切れないための 3 つの指定だけを見る。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
const printAt = css.lastIndexOf('@media print {');
const printBlock = css.slice(printAt);

test('印刷の規則は、表の画面の規則より後ろにある', () => {
  const tableAt = css.indexOf('table.scen, table.years {');
  assert.ok(tableAt > 0, '表の画面の規則が見つからない');
  assert.ok(printAt > tableAt, '印刷の規則が表の規則より前にある');
});

test('折れ線は紙の境で切れず、表は行の途中で分かれず、表は 2 枚目から', () => {
  assert.match(printBlock, /#chart-box\s*\{\s*break-inside:\s*avoid;/);
  assert.match(printBlock, /table\.years tr\s*\{\s*break-inside:\s*avoid;/);
  assert.match(printBlock, /#year-box\s*\{\s*break-before:\s*page;/);
  assert.doesNotMatch(printBlock, /thead[^{]*\{[^}]*display:\s*(?!table-header-group)/, '見出しの行を次の段・ページに出す形を崩さない');
});
