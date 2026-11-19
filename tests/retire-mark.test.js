// 退職の年齢の印（Q-429）: 印の位置 ＝ 欄の値（空なら計算が使う既定の年齢）、範囲の端、今の年齢と同じ、キーの 1 歩
// 計算は calc.js の normalizeInput・simulate をそのまま呼ぶ（率は固定の値。手取りの計算の正しさは calc.test.js が見る）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Calc = require('../calc.js');
const C = require('../constants.js');
const RM = require('../retire-mark.js');

// 範囲は index.html の欄の属性から取る（数を写さない）
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const tag = /<input[^>]*id="retire-age"[^>]*>/.exec(html)[0];
const MIN = Number(/\bmin="(\d+)"/.exec(tag)[1]);
const MAX = Number(/\bmax="(\d+)"/.exec(tag)[1]);
const YEAR = 2026;

function result(raw) {
  const d = Calc.normalizeInput(Object.assign({ income: '500', housing: { type: 'rent', rent: '8' } }, raw), YEAR);
  const ctx = { year: YEAR, takeHomeSelf: 0.78, takeHomeSpouse: 0, pensionSelf: 1800000, pensionSpouse: 0, netRateSelf: 0.92, netRateSpouse: 0 };
  return { input: d, scenarios: [{ rows: Calc.simulate(d, ctx) }, { rows: Calc.simulate(d, ctx, { expenseMul: 1.1 }) }] };
}
function rowAt(res, age) { return res.scenarios[0].rows.find((r) => r.age === age); }

test('欄の min・max を index.html から読めて、計算の受ける範囲の中にある', () => {
  assert.ok(MIN < MAX);
  assert.equal(Calc.normalizeInput({ retireAge: String(MIN) }).retireAge, MIN);
  assert.equal(Calc.normalizeInput({ retireAge: String(MAX) }).retireAge, MAX);
});

test('欄が空なら、印は計算が使う既定の年齢（constants.js の ASSUME.retireAge）の所', () => {
  const res = result({ age: '35', retireAge: '' });
  const f = RM.frame(res, 640), r = RM.range(MIN, MAX, 35);
  const mk = RM.place(res, f, r);
  assert.equal(mk.age, C.ASSUME.retireAge);
  assert.equal(mk.at, C.ASSUME.retireAge);
  assert.equal(mk.x, f.x(C.ASSUME.retireAge));
  assert.equal(mk.y, f.y(rowAt(res, C.ASSUME.retireAge).balance));
});

test('印の位置 ＝ 欄の値。横の位置から年齢に戻すと同じ年齢', () => {
  for (let a = MIN; a <= MAX; a++) {
    const res = result({ age: '30', retireAge: String(a) });
    const f = RM.frame(res, 390), r = RM.range(MIN, MAX, 30);
    const mk = RM.place(res, f, r);
    assert.equal(mk.at, a);
    assert.equal(mk.x, f.x(a));
    assert.equal(mk.y, f.y(rowAt(res, a).balance));
    assert.equal(RM.ageAtX(mk.x, f), a);
  }
});

test('範囲の端: min と max の所に置け、キーで外へは出ない', () => {
  const r = RM.range(MIN, MAX, 30);
  assert.deepEqual(r, { min: MIN, max: MAX });
  assert.equal(RM.clamp(MAX + RM.keyStep('ArrowRight', false), r), MAX);
  assert.equal(RM.clamp(MAX + RM.keyStep('ArrowRight', true), r), MAX);
  assert.equal(RM.clamp(MIN + RM.keyStep('ArrowLeft', false), r), MIN);
  assert.equal(RM.clamp(MIN + 2 + RM.keyStep('ArrowLeft', true), r), MIN);
  const res = result({ age: '30', retireAge: String(MAX) });
  const f = RM.frame(res, 640);
  assert.equal(RM.place(res, f, r).x, f.x(MAX));
  // 引いて枠の外へ出しても、範囲の端で止まる
  assert.equal(RM.clamp(RM.ageAtX(f.W + 100, f), r), MAX);
  assert.equal(RM.clamp(RM.ageAtX(-100, f), r), MIN);
});

test('今の年齢と同じ: 範囲の左の端が今の年齢になり、印はグラフの左の端', () => {
  const age = MIN + 10;
  const r = RM.range(MIN, MAX, age);
  assert.deepEqual(r, { min: age, max: MAX });
  const res = result({ age: String(age), retireAge: String(age) });
  const f = RM.frame(res, 640);
  const mk = RM.place(res, f, r);
  assert.equal(mk.at, age);
  assert.equal(mk.x, f.L);
  assert.equal(RM.clamp(age + RM.keyStep('ArrowLeft', false), r), age);
});

test('退職の年齢が図の左端（今の年齢）より前なら、印は出さない。欄の値は変わらない（Q-432）', () => {
  for (const age of [66, 70, 80]) {
    // 欄が空（既定 65 歳）でも、欄に今の年齢より前の値が入っていても
    for (const retire of ['', String(MIN)]) {
      const res = result({ age: String(age), retireAge: retire });
      const f = RM.frame(res, 640), r = RM.range(MIN, MAX, age);
      assert.ok(res.input.retireAge < f.a0);
      assert.equal(RM.place(res, f, r), null, age + ' 歳・欄「' + retire + '」');
    }
    // 欄を図の範囲の中に直せば、印が出る
    const res = result({ age: String(age), retireAge: String(age) });
    const f = RM.frame(res, 640), r = RM.range(MIN, MAX, age);
    const mk = RM.place(res, f, r);
    assert.equal(mk.at, age);
    assert.equal(mk.x, f.L);
  }
});

test('退職の年齢が図の右端（何歳まで見るか）より後なら、印は出さない', () => {
  const res = result({ age: '30', retireAge: String(MAX), endAge: String(MAX - 1) });
  const f = RM.frame(res, 640);
  assert.ok(f.a1 < MAX);
  assert.equal(RM.place(res, f, RM.range(MIN, MAX, 30)), null);
});

test('今の年齢が欄の max を超えたら、印は出さない（動かせる年齢が無い）', () => {
  assert.equal(RM.range(MIN, MAX, MAX + 1), null);
  const res = result({ age: String(MAX + 1), retireAge: String(MAX) });
  assert.equal(RM.place(res, RM.frame(res, 640), RM.range(MIN, MAX, MAX + 1)), null);
  assert.deepEqual(RM.range(MIN, MAX, MAX), { min: MAX, max: MAX });
});

test('キーの 1 歩: ← → で 1 歳、Shift で 5 歳、ほかのキーは 0', () => {
  assert.equal(RM.keyStep('ArrowRight', false), 1);
  assert.equal(RM.keyStep('ArrowLeft', false), -1);
  assert.equal(RM.keyStep('ArrowRight', true), 5);
  assert.equal(RM.keyStep('ArrowLeft', true), -5);
  assert.equal(RM.keyStep('ArrowUp', false), 0);
  assert.equal(RM.keyStep('Enter', true), 0);
});

test('印を動かしても計算の関数は同じ: 欄の値を変えて run の前の正規化を通すと、その年齢で働く収入が止まる', () => {
  const a = 60;
  const res = result({ age: '40', retireAge: String(a) });
  assert.equal(res.input.retireAge, a);
  assert.ok(rowAt(res, a - 1).work > 0);
  assert.equal(rowAt(res, a).work, 0);
});

// Q-610: 印にフォーカスが在る間と引いている間は、軸の端を変えない（2 つの印とも。Q-579 の年金の印の作りに合わせる）
const mainJs = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

test('退職の年齢を動かすと、今の式の縦の端は変わる（止めないと目盛りが手の下で動く）。横の端は変わらない', () => {
  const f65 = RM.frame(result({ age: '40', retireAge: '65' }), 390);
  const f70 = RM.frame(result({ age: '40', retireAge: '70' }), 390);
  assert.notEqual(f65.hi, f70.hi);
  assert.deepEqual([f65.a0, f65.a1], [f70.a0, f70.a1]);
});

test('止めた枠のまま退職の年齢を欄の min → max へ動かしても、印は消えず、枠の横の中に在る', () => {
  const held = RM.frame(result({ age: '40', retireAge: String(MIN) }), 390);
  for (let a = MIN; a <= MAX; a++) {
    const res = result({ age: '40', retireAge: String(a) });
    const mk = RM.place(res, held, RM.range(MIN, MAX, 40));
    assert.ok(mk, a + ' 歳');
    assert.equal(mk.at, a);
    assert.ok(mk.x >= held.L && mk.x <= held.W - held.R, a + ' 歳');
  }
});

test('main.js: フォーカスで枠を止め、外れたら今の式で描き直すのは bindMark の中（2 つの印とも）。描くときは止めた枠を先に使う', () => {
  const body = /function bindMark\(m\) \{[\s\S]*?\n  \}\n/.exec(mainJs)[0];
  assert.match(body, /btn\.addEventListener\('focus', function \(\) \{ if \(m\.view\) hold = m\.view\.f; \}\);/);
  assert.match(body, /btn\.addEventListener\('blur', function \(\) \{\s*hold = null;\s*if \(last && last\.ready\) renderChart\(last\);/);
  assert.match(body, /this\.focus\(\);/, '引き始めにフォーカスを入れる（引いている間も止まる）');
  assert.doesNotMatch(mainJs, /marks\.(pension|retire)\.btn\.addEventListener\('(focus|blur)'/, '片方の印だけに付けない');
  assert.match(mainJs, /bindMark\(marks\.retire\);\s*bindMark\(marks\.pension\);/);
  assert.match(mainJs, /var f = hold \|\| RM\.frame\(res, box\.clientWidth\);/);
});

test('main.js: 止めた枠を線が超えた分は、枠の上下で切る（線は clipPath の中）', () => {
  assert.match(mainJs, /<clipPath id="chart-clip"><rect x="0" y="' \+ T \+ '" width="' \+ W \+ '" height="' \+ \(H - T - B\) \+ '"\/><\/clipPath><g clip-path="url\(#chart-clip\)">/);
  const i = mainJs.indexOf('clip-path="url(#chart-clip)"'), j = mainJs.indexOf("out.push('</g>');");
  assert.ok(i > 0 && j > i);
  const inner = mainJs.slice(i, j);
  assert.match(inner, /<polyline /);
  assert.match(inner, /class="l-neg"/);
});
