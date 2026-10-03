// 計算のテスト: node --test tests/*.test.js
// ROADMAP 7.22 の検算 4 件（a〜d）と、既定値ファイル・使い方ページの出典の表の突き合わせ、書かない語の検査
// seido-keisan（手取り・税の計算）は、環境変数 SEIDO_KEISAN_DIR か、となりのフォルダ ../seido-keisan から読む。
// CI（.github/workflows/test.yml）では seido-keisan を取ってきて SEIDO_KEISAN_DIR を渡す。CI で見つからなければ失敗にする
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Calc = require('../calc.js');
const C = require('../constants.js');

const ROOT = path.join(__dirname, '..');
const SEIDO = [process.env.SEIDO_KEISAN_DIR, path.join(ROOT, '..', 'seido-keisan')].filter(Boolean)
  .find((d) => fs.existsSync(path.join(d, 'lib', 'take-home.js')));
if (!SEIDO && process.env.CI) throw new Error('seido-keisan が見つからない（SEIDO_KEISAN_DIR）');
function deps() {
  const L = (f) => require(path.join(SEIDO, 'lib', f));
  return {
    TakeHome: L('take-home.js'), TakeHomeValues: L('take-home-values.js'), Nenmatsu: L('nenmatsu.js'), TaxValues: L('tax2026.js'),
    Juminzei: L('juminzei.js'), JuminzeiValues: L('juminzei-values.js'), Ikukyu: L('ikukyu.js'), KuriageValues: L('kuriage-values.js'),
  };
}
const needSeido = { skip: SEIDO ? false : 'seido-keisan が無い（SEIDO_KEISAN_DIR）' };

const Y = 2026;
// 収入も支出も 0 にした入力（年金・生活費・医療費は 0 を手で入れる。住まいは家賃 0）
function zeroInput(extra) {
  return Object.assign({
    age: 30, income: 0, housing: { type: 'rent', rent: 0, renewal: 0 },
    pension: { self: 0 }, living: 0, medical: 0,
  }, extra);
}
const ZERO_CTX = { year: Y, takeHomeSelf: 0, takeHomeSpouse: 0, pensionSelf: 0, pensionSpouse: 0, netRateSelf: 1, netRateSpouse: 1 };

test('検算 (a) 収入 0・支出 0・資産 1,000万・利回り 0 → 100 歳まで 1,000万のまま', () => {
  const d = Calc.normalizeInput(zeroInput({ savings: 1000 }), Y);
  const rows = Calc.simulate(d, ZERO_CTX);
  assert.equal(rows.length, 71);                      // 30 歳〜100 歳
  assert.equal(rows[rows.length - 1].age, 100);
  for (const x of rows) assert.equal(x.balance, 10000000, `${x.age} 歳`);
});

test('検算 (b) 利回り 2%・支出 0・収入 0・資産 100万 → 10 年後 1,218,994 円（1.02^10）', () => {
  const d = Calc.normalizeInput(zeroInput({ savings: 100, rate: 2 }), Y);
  const rows = Calc.simulate(d, ZERO_CTX);
  assert.equal(Math.round(rows[9].balance), 1218994);  // 10 年目の年末
  assert.equal(Math.round(1000000 * Math.pow(1.02, 10)), 1218994);
});

test('検算 (c) 子 1 人・全公立と全私立: 教育費の合計 ＝ 値ファイルの段階別の年額 × 年数の合計（1 円単位）', () => {
  const G = C.gakushuhi.value;
  const base = (kid) => Calc.normalizeInput(zeroInput({ kids: [Object.assign({ birth: Y }, kid)] }), Y);
  const sum = (kid) => Calc.summarize(Calc.simulate(base(kid), ZERO_CTX)).eduTotal;
  // 幼稚園 3 年・小学校 6 年・中学校 3 年・高校 3 年
  const pub = G.kinder.pub * 3 + G.elem.pub * 6 + G.junior.pub * 3 + G.high.pub * 3;
  const pri = G.kinder.pri * 3 + G.elem.pri * 6 + G.junior.pri * 3 + G.high.pri * 3;
  assert.equal(sum({ school: 'pub', univ: 'none' }), pub);
  assert.equal(sum({ school: 'pri', univ: 'none' }), pri);
  // 大学 4 年: 国立は 入学料 ＋ 授業料 × 4、私立は 入学料 ＋（授業料 ＋ 施設設備費）× 4、自宅外は 仕送り × 4 を足す
  const N = C.univNational.value, R = C.univPrivate.value.ri, B = C.univPrivate.value.bun;
  assert.equal(sum({ school: 'pub', univ: 'kokuritsu' }), pub + N.entrance + N.tuition * 4);
  assert.equal(sum({ school: 'pri', univ: 'ri', away: true }), pri + R.entrance + (R.tuition + R.facility) * 4 + C.shiokuri.value * 4);
  assert.equal(sum({ school: 'pub', univ: 'bun' }), pub + B.entrance + (B.tuition + B.facility) * 4);
  // 途中の段階だけ私立
  assert.equal(sum({ school: 'jr', univ: 'none' }), G.kinder.pub * 3 + G.elem.pub * 6 + G.junior.pri * 3 + G.high.pri * 3);
  assert.equal(sum({ school: 'hi', univ: 'none' }), G.kinder.pub * 3 + G.elem.pub * 6 + G.junior.pub * 3 + G.high.pri * 3);
});

test('検算 (d) 年収 500万・独身・賃貸 8万の最小入力で結果が出て、手取り率が seido-keisan の計算と ±0.5 ポイント', needSeido, () => {
  const D = deps();
  const r = Calc.run({ age: 30, income: 500, housing: { type: 'rent', rent: 8 } }, D, Y);
  assert.equal(r.ready, true);
  assert.ok(r.scenarios[0].rows.length > 0);
  const t = D.TakeHome.calc({ period: 'year', amount: 5000000, juminNow: 'same' });
  const direct = t.year.net / t.gross;
  assert.ok(Math.abs(r.ctx.takeHomeSelf - direct) <= 0.005, `${r.ctx.takeHomeSelf} と ${direct}`);
  // 1 年目の勤労の収入 ＝ 年収 × 手取り率
  assert.equal(r.scenarios[0].rows[0].work, Math.round(5000000 * r.ctx.takeHomeSelf));
});

test('必須の 4 項目がそろうまで結果を出さない', () => {
  assert.equal(Calc.run({}, {}, Y).ready, false);
  assert.equal(Calc.run({ age: 30, income: 500 }, {}, Y).ready, false);                       // 家賃が空
  assert.equal(Calc.run({ age: 30, income: 500, housing: { type: 'own' } }, {}, Y).ready, false); // ローンの月額が空
});

test('基本の生活費 ＝ 家計調査の 消費支出 − 住居 − 保健医療 − 教育（1 人は単身世帯、2 人以上は二人以上の世帯の表）', () => {
  assert.equal(Calc.livingMonthly(1, 30), 177542 - 35060 - 6735 - 161);
  assert.equal(Calc.livingMonthly(1, 45), 198488 - 28041 - 8084 - 0);
  assert.equal(Calc.livingMonthly(2, 34), 285285 - 31971 - 13729 - 5170);
  assert.equal(Calc.livingMonthly(4, 52), 379853 - 16305 - 15411 - 38685);
  assert.equal(Calc.livingMonthly(2, 90), 236684 - 17046 - 20190 - 204);
});

test('医療費 ＝ 年齢階級別の一人当たり国民医療費 × 自己負担の割合', () => {
  assert.equal(Calc.medicalYear(3, 'ippan'), Math.round(195400 * 0.2));
  assert.equal(Calc.medicalYear(10, 'ippan'), Math.round(195400 * 0.3));
  assert.equal(Calc.medicalYear(30, 'ippan'), Math.round(148300 * 0.3));
  assert.equal(Calc.medicalYear(50, 'ippan'), Math.round(306800 * 0.3));
  assert.equal(Calc.medicalYear(67, 'ippan'), Math.round(797200 * 0.3));
  assert.equal(Calc.medicalYear(72, 'ippan'), Math.round(864900 * 0.2));
  assert.equal(Calc.medicalYear(72, 'genekinami'), Math.round(864900 * 0.3));
  assert.equal(Calc.medicalYear(80, 'ippan'), Math.round(953800 * 0.1));
  assert.equal(Calc.medicalYear(80, 'ichitei'), Math.round(953800 * 0.2));
});

test('年金の概算: 基礎は満額、厚生は 標準報酬月額 × 5.481/1000 × 平成15年4月以降の月数', needSeido, () => {
  const D = deps();
  const e = Calc.pensionEstimate({ income: 5000000, birthYear: 1996, joinAge: 22, retireAge: 65 }, D);
  assert.equal(e.kiso, 847300);
  assert.equal(e.std, 410000);                           // 月 416,666 円 → 標準報酬月額 41 万円
  assert.equal(e.months, (2061 - 2018) * 12);
  assert.equal(e.kosei, Math.round(410000 * 5.481 / 1000 * 516));
  // 平成15年3月以前は数えない（1970 年生まれ・22 歳で加入 → 2003 年 4 月から）
  const old = Calc.pensionEstimate({ income: 5000000, birthYear: 1970, joinAge: 22, retireAge: 65 }, D);
  assert.equal(old.months, Math.round((2035 - 2003.25) * 12));
  assert.equal(Calc.pensionEstimate({ income: 0, birthYear: 1996, joinAge: 22, retireAge: 65 }, D).kosei, 0);
});

test('繰上げ・繰下げの率は seido-keisan の値（0.4%・0.7%／月）', needSeido, () => {
  const D = deps();
  assert.equal(Calc.startFactor(65, D), 1);
  assert.ok(Math.abs(Calc.startFactor(60, D) - 0.76) < 1e-12);
  assert.ok(Math.abs(Calc.startFactor(70, D) - 1.42) < 1e-12);
  assert.ok(Math.abs(Calc.startFactor(75, D) - 1.84) < 1e-12);
});

test('公的年金等に係る雑所得（65歳以上）: 国税庁 No.1600 の例 350万円 → 235万円', () => {
  assert.equal(Calc.nenkinShotoku(3500000), 2350000);
  assert.equal(Calc.nenkinShotoku(1100000), 0);
  assert.equal(Calc.nenkinShotoku(2000000), 900000);
  assert.equal(Calc.nenkinShotoku(5000000), 5000000 * 0.85 - 685000);
});

test('年金の手取り: 年金 200万円 → 所得税 0・住民税 49,500 円（(90万 − 43万) × 10% − 調整控除 2,500 ＋ 均等割等 5,000）', needSeido, () => {
  const n = Calc.pensionNet(2000000, deps());
  assert.equal(n.incomeTax, 0);
  assert.equal(n.resident, 49500);
  assert.equal(n.net, 1950500);
  // 250万円 → 雑所得 140万円、所得税 (140万 − 基礎控除 104万) × 5% × 102.1% = 18,378 → 18,300
  const m = Calc.pensionNet(2500000, deps());
  assert.equal(m.incomeTax, 18300);
  // 雑所得 45万円以下は住民税なし
  assert.equal(Calc.pensionNet(1500000, deps()).resident, 0);
});

test('筋書き: 支出 +10% と、利回りが 0 でなければ 利回り 0 を並べる', needSeido, () => {
  const D = deps();
  const a = Calc.run({ age: 40, income: 600, housing: { type: 'rent', rent: 10 } }, D, Y);
  assert.deepEqual(a.scenarios.map((s) => s.key), ['base', 'exp10']);
  const b = Calc.run({ age: 40, income: 600, housing: { type: 'rent', rent: 10 }, rate: 1 }, D, Y);
  assert.deepEqual(b.scenarios.map((s) => s.key), ['base', 'exp10', 'rate0']);
  const r0 = b.scenarios[0].rows[0], r1 = b.scenarios[1].rows[0];
  assert.ok(Math.abs(r1.expense - r0.expense * 1.1) <= 6, `${r1.expense} と ${r0.expense} × 1.1`);
  assert.equal(r1.income, r0.income);
});

test('住まい: 賃貸は 2 年に 1 回 更新料（既定 1 か月）、持ち家はローンを残り年数だけ（物価を掛けない）', () => {
  const d = Calc.normalizeInput({ age: 30, income: 0, housing: { type: 'rent', rent: 8 }, pension: { self: 0 }, living: 0, medical: 0, inflation: 0 }, Y);
  const rows = Calc.simulate(d, ZERO_CTX);
  assert.equal(rows[0].parts.housing, 960000);
  assert.equal(rows[1].parts.housing, 1040000);
  const o = Calc.normalizeInput({ age: 30, income: 0, housing: { type: 'own', loan: 10, loanYears: 2, ownCost: 15 }, pension: { self: 0 }, living: 0, medical: 0, inflation: 2 }, Y);
  const ro = Calc.simulate(o, ZERO_CTX);
  assert.deepEqual([ro[0].parts.loan, ro[1].parts.loan, ro[2].parts.loan], [1200000, 1200000, 0]);
  assert.equal(ro[1].parts.housing, Math.round(150000 * 1.02));
});

test('結果の 3 つの数字: 0 を切る年齢・60 歳時点の残高・教育費の合計', () => {
  const d = Calc.normalizeInput(zeroInput({ age: 50, savings: 100, specials: [{ year: Y + 15, amount: 300 }] }), Y);
  const s = Calc.summarize(Calc.simulate(d, ZERO_CTX));
  assert.equal(s.at60, 1000000);
  assert.equal(s.negAge, 65);
  assert.equal(s.eduTotal, 0);
});

test('CSV: 見出し 1 行 ＋ 年ごとの行', () => {
  const rows = Calc.simulate(Calc.normalizeInput(zeroInput({ age: 58, savings: 1000, endAge: 60 }), Y), ZERO_CTX);
  const lines = Calc.toCsv(rows).trim().split('\r\n');
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^年,本人の年齢,収入/);
  assert.match(lines[1], /^2026,58,0,/);
});

test('入力の正規化: 共有リンク・ファイルの中身はそのまま信じない', () => {
  const d = Calc.normalizeInput({ age: '200', income: '-5', kids: [{ birth: 'x' }, { birth: Y - 2, school: 'zzz' }], rate: 99, endAge: 300 }, Y);
  assert.equal(d.age, null);
  assert.equal(d.income, null);
  assert.equal(d.kids.length, 1);
  assert.equal(d.kids[0].school, 'pub');
  assert.equal(d.rate, 20);
  assert.equal(d.endAge, 100);
  assert.equal(Calc.normalizeInput({ income: '1,234.56万円' }, Y).income, 1234.6);
});

// ---------- 既定値ファイルと使い方ページ ----------
const guide = fs.readFileSync(path.join(ROOT, 'guide.html'), 'utf8');
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

test('constants: すべての値に source・url・checked がある', () => {
  for (const [key, c] of Object.entries(C)) {
    assert.ok(c.source && c.url && c.checked, `${key} に source / url / checked が無い`);
    assert.match(c.checked, /^\d{4}-\d{2}-\d{2}$/, `${key} の checked は YYYY-MM-DD`);
    assert.ok(c.value !== undefined, `${key} に value が無い`);
  }
});

test('使い方ページの出典の表が constants と一致する（各行の資料名・URL・確認日）', () => {
  const unesc = (s) => s.replace(/&amp;/g, '&');
  const table = unesc((guide.match(/<table id="sources"[\s\S]*?<\/table>/) || [''])[0]);
  assert.ok(table, 'guide.html に <table id="sources"> が無い');
  for (const [key, c] of Object.entries(C)) {
    const row = (table.match(new RegExp(`<tr data-key="${key}">[\\s\\S]*?</tr>`)) || [''])[0];
    assert.ok(row, `出典の表に ${key} の行が無い`);
    assert.ok(row.includes(c.source), `${key}: 資料名が違う`);
    assert.ok(row.includes(`href="${c.url}"`), `${key}: URL が違う`);
    assert.ok(row.includes(c.checked), `${key}: 確認日が違う`);
  }
  const rows = table.match(/<tr data-key=/g) || [];
  assert.equal(rows.length, Object.keys(C).length, '出典の表に constants に無い行がある');
});

test('使い方ページの出典の表の数字が constants と一致する（data-yen の値）', () => {
  const nums = [...guide.matchAll(/data-yen="([a-zA-Z0-9.]+)">([\d,.]+)/g)];
  assert.ok(nums.length >= 20, '数字の行が少ない: ' + nums.length);
  for (const [, k, shown] of nums) {
    const v = k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), C);
    assert.ok(typeof v === 'number', `data-yen="${k}" が constants に無い`);
    assert.equal(Number(shown.replace(/,/g, '')), v, k);
  }
});

test('書かない語: 商品名・「おすすめ」・断定（ROADMAP 7.22。REVIEW R3）', () => {
  const NG = /おすすめ|オススメ|投資信託|インデックスファンド|NISA|iDeCo|イデコ|つみたて|学資保険|老後\s*2,?000\s*万|2000万円問題|不足しています|足りません/;
  for (const f of ['index.html', 'guide.html', 'main.js', 'calc.js', 'constants.js']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const m = s.match(NG);
    assert.equal(m, null, `${f} に「${m && m[0]}」`);
  }
});

test('画面: 広告は meta だけ（script なし）、使い方ページは script あり。定型文と消すボタン', () => {
  assert.match(index, /<meta name="google-adsense-account"/);
  assert.doesNotMatch(index, /adsbygoogle\.js/);
  assert.match(guide, /adsbygoogle\.js/);
  assert.match(index, /この計算は目安です。実際の額は年金事務所・勤め先・学校が決めます。/);
  assert.match(guide, /この計算は目安です。実際の額は年金事務所・勤め先・学校が決めます。/);
  assert.match(index, /data-reset-storage="lifeplan_"/);
  assert.match(index, /reset-storage\.js/);
});
