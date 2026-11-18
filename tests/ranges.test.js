// 入力が受ける範囲の数（Q-432、yorozu-plans の QUEUE 2026-11-18 午後。Q-366 と同じ型）
// 芯は constants.js の RANGE の 1 か所。calc.js の normalizeInput はそこから丸める。
// index.html の欄の min・max・step と、欄の下の案内の文の数は直書きのままで、ここで芯と突き合わせる。芯を 1 変えると落ちる
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../constants.js');
const Calc = require('../calc.js');

const R = C.RANGE;
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const YEAR = 2026;

function input(id) {
  const m = new RegExp('<input[^>]* id="' + id + '"[^>]*>').exec(html);
  assert.ok(m, id + ' の欄が index.html に無い');
  const at = (a) => { const x = new RegExp(' ' + a + '="([^"]*)"').exec(m[0]); return x ? Number(x[1]) : null; };
  return { min: at('min'), max: at('max'), step: at('step') };
}

// 欄の id → 芯の名前 → normalizeInput の入力と結果の取り出し方
const FIELDS = [
  ['age', 'age', (v) => ({ age: v }), (d) => d.age],
  ['spouse-age', 'spouseAge', (v) => ({ spouse: { has: true, age: v } }), (d) => d.spouse.age],
  ['loan-years', 'loanYears', (v) => ({ housing: { type: 'own', loanYears: v } }), (d) => d.housing.loanYears],
  ['renewal', 'renewal', (v) => ({ housing: { renewal: v } }), (d) => d.housing.renewal],
  ['retire-age', 'retireAge', (v) => ({ retireAge: v }), (d) => d.retireAge],
  ['join-age', 'joinAge', (v) => ({ pension: { joinAge: v } }), (d) => d.pension.joinAge],
  ['p-start', 'pensionStart', (v) => ({ pension: { start: v } }), (d) => d.pension.start],
  ['p-net', 'netRate', (v) => ({ pension: { netRate: v } }), (d) => d.pension.netRate],
  ['kaigo-from', 'kaigoFrom', (v) => ({ kaigo: { from: v } }), (d) => d.kaigo.from],
];

for (const [id, key, put, get] of FIELDS) {
  test('欄 ' + id + ' の min・max ＝ 芯 RANGE.' + key, () => {
    const a = input(id);
    assert.equal(a.min, R[key][0], id + ' の min');
    assert.equal(a.max, R[key][1], id + ' の max');
  });
  test('計算は 芯 RANGE.' + key + ' の端で受ける', () => {
    const [lo, hi] = R[key];
    assert.equal(get(Calc.normalizeInput(put(String(lo)), YEAR)), lo);
    assert.equal(get(Calc.normalizeInput(put(String(hi)), YEAR)), hi);
    const below = get(Calc.normalizeInput(put(String(lo - 1)), YEAR));
    const above = get(Calc.normalizeInput(put(String(hi + 1)), YEAR));
    if (key === 'age') { assert.equal(below, null); assert.equal(above, null); }   // 年齢は範囲の外なら「入っていない」
    else { assert.equal(below, lo); assert.equal(above, hi); }
  });
}

test('何歳まで見るか: 選択肢は芯 RANGE.endAge の中、いちばん上が上限。計算も同じ範囲で受ける', () => {
  const sel = /<select id="end-age">([\s\S]*?)<\/select>/.exec(html)[1];
  const opts = [...sel.matchAll(/value="(\d+)"/g)].map((m) => Number(m[1]));
  assert.ok(opts.length > 0);
  opts.forEach((v) => assert.ok(v >= R.endAge[0] && v <= R.endAge[1], v + ' 歳'));
  assert.equal(Math.max(...opts), R.endAge[1]);
  assert.equal(Calc.normalizeInput({ endAge: String(R.endAge[1] + 1) }, YEAR).endAge, R.endAge[1]);
  assert.equal(Calc.normalizeInput({ endAge: String(R.endAge[0] - 1) }, YEAR).endAge, R.endAge[0]);
  // main.js は選択肢を写さず、index.html の選択肢から読む
  assert.doesNotMatch(mainJs, /\['80', '85'/);
});

test('利回り・物価・昇給率: 計算は 芯 RANGE の端で受け、外は端に寄せる（欄に min・max は無い）', () => {
  for (const key of ['rate', 'inflation', 'raise']) {
    const [lo, hi] = R[key];
    assert.equal(Calc.normalizeInput({ [key]: String(lo) }, YEAR)[key], lo);
    assert.equal(Calc.normalizeInput({ [key]: String(hi) }, YEAR)[key], hi);
    assert.equal(Calc.normalizeInput({ [key]: String(lo - 1) }, YEAR)[key], lo);
    assert.equal(Calc.normalizeInput({ [key]: String(hi + 1) }, YEAR)[key], hi);
    const a = input(key);
    assert.equal(a.min, null, key + ' の min');
    assert.equal(a.max, null, key + ' の max');
  }
});

test('年金の欄の下の案内「60〜75 歳」の数 ＝ 芯 RANGE.pensionStart', () => {
  const m = /(\d+)〜(\d+) 歳の増減の率/.exec(html);
  assert.ok(m, '案内の文が index.html に無い');
  assert.deepEqual([Number(m[1]), Number(m[2])], R.pensionStart);
});

test('金額の欄の step ＝ 芯 RANGE.manDecimals の桁、min は 0（計算は負の額を受けない）', () => {
  const step = Math.pow(10, -R.manDecimals);
  const ids = ['income', 'spouse-income', 'rent', 'loan', 'savings', 'severance', 'p-self', 'p-spouse', 'living', 'medical', 'car', 'insurance', 'kaigo', 'own-cost'];
  for (const id of ids) {
    const a = input(id);
    assert.equal(a.step, step, id + ' の step');
    assert.equal(a.min, 0, id + ' の min');
  }
  // 特別費の額の欄は main.js が作る
  assert.match(mainJs, new RegExp('data-f="amount"'));
  assert.match(mainJs, new RegExp('inputmode="decimal" step="' + step + '" data-i="'));
  // 計算はその桁で丸める
  const d = Calc.normalizeInput({ income: '1.26' }, YEAR);
  assert.equal(d.income, Math.round(1.26 * Math.pow(10, R.manDecimals)) / Math.pow(10, R.manDecimals));
  assert.equal(Calc.normalizeInput({ income: '-1' }, YEAR).income, null);
});

test('子の人数・特別費の件数の上限 ＝ 芯 RANGE.kids・RANGE.specials（main.js は芯から読む）', () => {
  const kids = Array.from({ length: R.kids + 1 }, (_, i) => ({ birth: String(YEAR - i) }));
  assert.equal(Calc.normalizeInput({ kids }, YEAR).kids.length, R.kids);
  const specials = Array.from({ length: R.specials + 1 }, () => ({ year: String(YEAR + 1), amount: '1' }));
  assert.equal(Calc.normalizeInput({ specials }, YEAR).specials.length, R.specials);
  assert.equal((mainJs.match(/slice\(0, RANGE\.kids\)/g) || []).length, 2);
  assert.equal((mainJs.match(/slice\(0, RANGE\.specials\)/g) || []).length, 1);
});
