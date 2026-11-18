// 年金を受け取り始める年齢の印（Q-579）: 印の位置 ＝ 欄の値（60・65・70・75 と空）、範囲は欄の属性から、退職の印と寄る年齢での置き方
// 計算は calc.js の normalizeInput・simulate をそのまま呼ぶ（率は固定の値。繰上げ・繰下げの率の正しさは calc.test.js と seido-keisan が見る）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Calc = require('../calc.js');
const C = require('../constants.js');
const RM = require('../retire-mark.js');

// 範囲は index.html の欄の属性から取る（数を写さない）
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mainJs = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const attrs = (id) => {
  const tag = new RegExp('<input[^>]*id="' + id + '"[^>]*>').exec(html)[0];
  return { min: Number(/\bmin="(\d+)"/.exec(tag)[1]), max: Number(/\bmax="(\d+)"/.exec(tag)[1]) };
};
const P = attrs('p-start'), R = attrs('retire-age');
const YEAR = 2026;
const TAP = 44, GAP = 8;   // 押す所の大きさ（DESIGN の 44px）と、2 つの印の間（main.js の GAP）

function result(raw) {
  const d = Calc.normalizeInput(Object.assign({ income: '500', housing: { type: 'rent', rent: '8' } }, raw), YEAR);
  const ctx = { year: YEAR, takeHomeSelf: 0.78, takeHomeSpouse: 0, pensionSelf: 1800000, pensionSpouse: 0, netRateSelf: 0.92, netRateSpouse: 0 };
  return { input: d, scenarios: [{ rows: Calc.simulate(d, ctx) }, { rows: Calc.simulate(d, ctx, { expenseMul: 1.1 }) }] };
}
function rowAt(res, age) { return res.scenarios[0].rows.find((r) => r.age === age); }
function pensionPlace(res, f) {
  return RM.place(res, f, RM.range(P.min, Math.min(P.max, f.a1), res.input.age), res.input.pension.start);
}

test('欄 p-start の min・max は芯 RANGE.pensionStart と同じで、計算はその範囲で受ける', () => {
  assert.deepEqual([P.min, P.max], C.RANGE.pensionStart);
  assert.equal(Calc.normalizeInput({ pension: { start: String(P.min) } }).pension.start, P.min);
  assert.equal(Calc.normalizeInput({ pension: { start: String(P.max) } }).pension.start, P.max);
});

test('印の位置 ＝ 欄の値（60・65・70・75）。空なら計算が使う既定の年齢（ASSUME.pensionStart）', () => {
  for (const s of [String(P.min), '65', '70', String(P.max), '']) {
    const res = result({ age: '40', pension: { start: s } });
    const want = s === '' ? C.ASSUME.pensionStart : Number(s);
    for (const w of [390, 1280]) {
      const f = RM.frame(res, w);
      const pk = pensionPlace(res, f);
      assert.equal(pk.at, want, '欄「' + s + '」');
      assert.equal(pk.x, f.x(want));
      assert.equal(pk.y, f.y(rowAt(res, want).balance));
      assert.equal(RM.ageAtX(pk.x, f), want);
    }
  }
});

test('計算は欄の年齢から年金を数える（印を動かすと結果が変わる道）。その年の前の年は 0', () => {
  for (let s = P.min; s <= P.max; s++) {
    const res = result({ age: '40', pension: { start: String(s) } });
    assert.equal(res.input.pension.start, s);
    assert.equal(rowAt(res, s - 1).pension, 0, s + ' 歳の前の年');
    assert.ok(rowAt(res, s).pension > 0, s + ' 歳');
  }
});

test('範囲の端: 欄の min・max で止まり、図の右端（何歳まで見るか）と今の年齢の外へは動かない', () => {
  const r = RM.range(P.min, P.max, 40);
  assert.deepEqual(r, { min: P.min, max: P.max });
  assert.equal(RM.clamp(P.max + RM.keyStep('ArrowRight', false), r), P.max);
  assert.equal(RM.clamp(P.min + RM.keyStep('ArrowLeft', false), r), P.min);
  // 何歳まで見るかが欄の max より前なら、右の端はそこ
  const res = result({ age: '40', endAge: String(P.max - 5), pension: { start: String(P.max - 5) } });
  const f = RM.frame(res, 640);
  assert.equal(f.a1, P.max - 5);
  const pr = RM.range(P.min, Math.min(P.max, f.a1), 40);
  assert.equal(pr.max, f.a1);
  assert.equal(pensionPlace(res, f).at, f.a1);
  // 今の年齢が欄の min より後なら、左の端は今の年齢。それより前の年齢の欄なら印は出さない
  const old = result({ age: '70', pension: { start: '65' } });
  assert.equal(pensionPlace(old, RM.frame(old, 640)), null);
  assert.deepEqual(RM.range(P.min, P.max, 70), { min: 70, max: P.max });
});

test('退職の印と同じ年齢・寄る年齢では、2 つの押す所が重ならず間が 8 px 以上（390・1,280 の幅）', () => {
  for (const w of [390, 1280]) {
    for (const a of [R.min, 60, 65, 70, 75]) {
      const res = result({ age: '40', retireAge: String(a), pension: { start: String(Math.max(P.min, Math.min(P.max, a))) } });
      const f = RM.frame(res, w);
      const mk = RM.place(res, f, RM.range(R.min, R.max, 40));
      const pk = pensionPlace(res, f);
      if (!mk || !pk) continue;
      const s = Math.min(w, 760) / f.W;   // 図の箱の幅（px）÷ viewBox の幅
      if (!RM.near(mk, pk, s, TAP, GAP)) continue;
      const lim = { top: (TAP / 2 + 20) / s, bottom: f.H - TAP / 2 / s };
      const st = RM.stack(mk, pk, s, TAP, GAP, lim);
      const between = (st.bottom - st.top) * s - TAP;
      assert.ok(between >= GAP, w + 'px・' + a + ' 歳: 間 ' + between);
      assert.ok(st.top < st.bottom, '退職の印が上');
      assert.ok(st.top >= lim.top - 1e-9, '退職の印の字を図の上へ出さない');
    }
  }
});

test('寄るかどうか: 同じ点は寄る。縦か横に 52 px 以上離れれば寄らない', () => {
  const a = { x: 100, y: 100 };
  assert.equal(RM.near(a, { x: 100, y: 100 }, 1, TAP, GAP), true);
  assert.equal(RM.near(a, { x: 151.9, y: 100 }, 1, TAP, GAP), true);
  assert.equal(RM.near(a, { x: 152, y: 100 }, 1, TAP, GAP), false);
  assert.equal(RM.near(a, { x: 100, y: 152 }, 1, TAP, GAP), false);
  assert.equal(RM.near(a, { x: 100, y: 126 }, 2, TAP, GAP), false);   // 画面の px で数える（viewBox の 26 × 2 px）
  // 上の端に当たれば、2 つ一緒に下へずらす（間は変えない）
  const st = RM.stack(a, a, 1, TAP, GAP, { top: 90, bottom: 1000 });
  assert.equal(st.top, 90);
  assert.equal(st.bottom - st.top, TAP + GAP + 1);
});

test('画面: 年金の印は button・紙に出さない・字を足さない（名前は欄のラベルから読む）・キーは ← →', () => {
  const tag = /<button[^>]*id="pension-mark"[^>]*>([\s\S]*?)<\/button>/.exec(html);
  assert.ok(tag, 'button#pension-mark が無い');
  assert.match(tag[0], /class="[^"]*\bno-print\b/);
  assert.match(tag[0], /aria-keyshortcuts="ArrowLeft ArrowRight"/);
  assert.equal(tag[1].replace(/<[^>]+>/g, '').trim(), '', '印の中に字を置かない');
  assert.match(mainJs, /label\[for="p-start"\]/);
  assert.doesNotMatch(mainJs, /['"]年金を受け取り始める年齢/, '名前を main.js の字に写さない（欄のラベルの字から）');
});
