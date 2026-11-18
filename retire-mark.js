// ===========================
// ライフプラン 簡易シミュレーション — 折れ線の目盛りと、退職の年齢の印の位置・動かせる範囲（画面から切り離した純粋関数）
// 計算はしない。印の年齢は calc.js の run が返す input.retireAge（欄が空なら constants.js の ASSUME.retireAge）をそのまま使う（Q-429）
// ブラウザでは window.RetireMark、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  /** 折れ線の枠と目盛り。res = calc.js の run の戻り値、width = グラフの箱の幅（px） */
  function frame(res, width) {
    var sc = res.scenarios, rows0 = sc[0].rows;
    var W = Math.max(320, Math.min(760, width || 640)), H = Math.round(W < 500 ? W * 0.62 : W * 0.42), L = 58, R = 26, T = 14, B = 34;
    var all = []; sc.forEach(function (x) { x.rows.forEach(function (r) { all.push(r.balance); }); });
    all.push(0);
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    if (hi === lo) hi = lo + 1;
    var pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    var a0 = rows0[0].age, a1 = rows0[rows0.length - 1].age;
    return {
      W: W, H: H, L: L, R: R, T: T, B: B, lo: lo, hi: hi, a0: a0, a1: a1,
      x: function (age) { return L + (W - L - R) * (a1 === a0 ? 0 : (age - a0) / (a1 - a0)); },
      y: function (v) { return T + (H - T - B) * (hi - v) / (hi - lo); },
    };
  }

  /** グラフの横の位置（viewBox の単位）→ いちばん近い年齢 */
  function ageAtX(px, f) {
    if (f.a1 === f.a0) return f.a0;
    return Math.round(f.a0 + (px - f.L) / (f.W - f.L - f.R) * (f.a1 - f.a0));
  }

  /** 動かせる範囲。min・max は欄の属性、age は今の年齢（それより前には動かない）。動かせる年齢が無ければ null */
  function range(min, max, age) {
    var lo = Math.max(Number(min), Number(age));
    var hi = Number(max);
    return lo > hi ? null : { min: lo, max: hi };
  }

  function clamp(a, r) { return Math.min(r.max, Math.max(r.min, a)); }

  /** キーの 1 歩。← → で 1 歳、Shift と ← → で 5 歳。ほかのキーは 0 */
  function keyStep(key, shift) {
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return 0;
    return (shift ? 5 : 1) * (key === 'ArrowRight' ? 1 : -1);
  }

  /**
   * 印の位置。印は「入力どおり」の線の上の、退職の年齢の年末の残高に置く。
   * age は計算が使った退職の年齢（res.input.retireAge）。
   * 図の範囲（左端 = 今の年齢、右端 = 何歳まで見るか）か動かせる範囲の外なら null（印を出さない）。
   * 端に寄せて描くと、図が欄と違う年齢を見せるため（Q-432）。欄の値は変えない
   */
  function place(res, f, r) {
    var age = res.input.retireAge;
    if (!r || age < f.a0 || age > f.a1 || age < r.min || age > r.max) return null;
    var rows0 = res.scenarios[0].rows;
    var row = null;
    for (var i = 0; i < rows0.length; i++) if (rows0[i].age === age) { row = rows0[i]; break; }
    if (!row) return null;
    return { age: age, at: age, x: f.x(age), y: f.y(row.balance) };
  }

  var RetireMark = { frame: frame, ageAtX: ageAtX, range: range, clamp: clamp, keyStep: keyStep, place: place };
  if (typeof module !== 'undefined' && module.exports) module.exports = RetireMark;
  else root.RetireMark = RetireMark;
})(this);
