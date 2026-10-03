// ===========================
// ライフプラン 簡易シミュレーション — 計算（画面から切り離した純粋関数）
// DOM や localStorage に触らない。tests/calc.test.js から node --test で確かめる
// 年ごとに、本人が「何歳まで見るか」（既定 100 歳）になる年まで:
//   年末の残高 ＝ 年初の残高 ×（1 ＋ 利回り）＋ その年の収入 − その年の支出   （利回りは年初の残高がプラスのときだけ掛ける）
// 手取り・税・社会保険料の計算は seido-keisan の lib/*.js をそのまま呼ぶ（deps。値も計算も写さない）:
//   働いている間の手取り率  lib/take-home.js の calc（その年収のときの手取り ÷ 年収 を 1 回だけ計算）
//   年金の手取り率          lib/nenmatsu.js の kisoKojo・sokusan、lib/tax2026.js の復興特別所得税、
//                           lib/juminzei-values.js・lib/juminzei.js の基礎控除・税率・均等割・非課税の基準
//   標準報酬月額            lib/ikukyu.js の hyojunFromSalary・hyojunKounen
//   繰上げ・繰下げの率      lib/kuriage-values.js
// ブラウザでは window.Calc、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var C = isNode ? require('./constants.js') : root.Constants;
  var A = C.ASSUME;
  var MAN = 10000;

  // ---------- 入力の正規化（保存・共有リンク・ファイル読み込み・計算の前に必ず通す） ----------
  // 金額は 万円 の数（小数 1 桁まで）で持つ。空欄は null（「自動」「入れていない」）
  function man(v, max) {
    if (v === undefined || v === null) return null;
    var s = String(v).replace(/[,，\s万円¥]/g, '');
    if (s === '') return null;
    var n = Number(s);
    if (!isFinite(n) || n < 0) return null;
    return Math.min(Math.round(n * 10) / 10, max || 100000);
  }
  function int(v, lo, hi, def) {
    if (v === undefined || v === null || String(v).trim() === '') return def;
    var n = Math.floor(Number(v));
    if (!isFinite(n)) return def;
    return Math.min(hi, Math.max(lo, n));
  }
  function pct(v, lo, hi, def) {
    if (v === undefined || v === null || String(v).trim() === '') return def;
    var n = Number(v);
    if (!isFinite(n)) return def;
    return Math.min(hi, Math.max(lo, Math.round(n * 100) / 100));
  }
  function pick(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }

  var SCHOOLS = ['pub', 'hi', 'jr', 'pri'];          // すべて公立／高校だけ私立／中学から私立／すべて私立
  var UNIVS = ['none', 'kokuritsu', 'bun', 'ri'];    // 行かない／国立／私立文系／私立理系
  var KUBUN = ['ippan', 'ichitei', 'genekinami'];    // 70歳からの医療費の負担（一般／一定以上所得／現役並み）
  var MAX_KIDS = 6, MAX_SPECIAL = 20;

  function normalizeInput(raw, thisYear) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var y = thisYear || new Date().getFullYear();
    var sp = r.spouse || {}, h = r.housing || {}, pe = r.pension || {}, k = r.kaigo || {};
    var age = int(r.age, 0, 999, null);
    return {
      age: age === null || age < 15 || age > 99 ? null : age,
      income: man(r.income, 100000),
      spouse: { has: !!sp.has, income: man(sp.income, 100000), age: int(sp.age, 15, 99, null) },
      kids: (Array.isArray(r.kids) ? r.kids : []).slice(0, MAX_KIDS).map(function (c) {
        c = c && typeof c === 'object' ? c : {};
        return {
          birth: int(c.birth, y - 30, y + 15, null),
          school: pick(c.school, SCHOOLS, 'pub'),
          univ: pick(c.univ, UNIVS, 'none'),
          away: !!c.away,
        };
      }).filter(function (c) { return c.birth !== null; }),
      housing: {
        type: pick(h.type, ['rent', 'own'], 'rent'),
        rent: man(h.rent, 1000), loan: man(h.loan, 1000), loanYears: int(h.loanYears, 0, 50, 0),
        ownCost: man(h.ownCost, 10000), renewal: pct(h.renewal, 0, 12, A.renewalMonths),
      },
      retireAge: int(r.retireAge, 40, 80, A.retireAge),
      severance: man(r.severance, 100000),
      pension: {
        self: man(pe.self, 10000), spouse: man(pe.spouse, 10000),
        start: int(pe.start, 60, 75, A.pensionStart),
        joinAge: int(pe.joinAge, 15, 70, A.joinAge),
        netRate: pct(pe.netRate, 0, 100, null),
      },
      living: man(r.living, 1000),          // 基本の生活費（月）。空欄なら家計調査から
      medical: man(r.medical, 10000),       // 医療費の自己負担（年、世帯）。空欄なら国民医療費から
      kubun: pick(r.kubun, KUBUN, 'ippan'),
      kaigo: { amount: man(k.amount, 10000), from: int(k.from, 40, 110, 75) },
      car: man(r.car, 10000),
      insurance: man(r.insurance, 10000),
      specials: (Array.isArray(r.specials) ? r.specials : []).slice(0, MAX_SPECIAL).map(function (s) {
        s = s && typeof s === 'object' ? s : {};
        return { year: int(s.year, y, y + 90, null), amount: man(s.amount, 100000) };
      }).filter(function (s) { return s.year !== null && s.amount !== null; }),
      savings: man(r.savings, 1000000),
      rate: pct(r.rate, -20, 20, A.rate),
      inflation: pct(r.inflation, -10, 20, A.inflation),
      raise: pct(r.raise, -10, 20, A.raise),
      endAge: int(r.endAge, 60, 100, A.endAge),
    };
  }

  function yen(m) { return m === null || m === undefined ? 0 : Math.round(m * MAN); }

  // 必須の 4 項目がそろったか（年齢・年収・住まいの額。家族は「なし」でもそろっている）
  function ready(d) {
    if (d.age === null || d.income === null) return false;
    if (d.housing.type === 'rent') return d.housing.rent !== null;
    return d.housing.loan !== null;
  }

  // ---------- 表を引く ----------
  function bandRow(table, age) {
    var row = table[0];
    for (var i = 0; i < table.length; i++) if (age >= table[i][0]) row = table[i];
    return row;
  }

  /** 基本の生活費（月、円）。persons は世帯の人数、age は本人（世帯主）の年齢 */
  function livingMonthly(persons, age) {
    var r = bandRow(persons <= 1 ? C.living1p.value : C.living2p.value, age);
    return r[1] - r[2] - r[3] - r[4];
  }

  /** 1 人の医療費の自己負担（年、円）。age はその年の年齢 */
  function medicalYear(age, kubun) {
    var F = C.futan.value;
    var per = bandRow(C.iryohi.value, age)[1];
    var rate;
    if (age <= 6) rate = F.preschool;
    else if (age < 70) rate = F.under70;
    else if (kubun === 'genekinami') rate = F.genekinami;
    else if (age < 75) rate = F.from70;
    else rate = kubun === 'ichitei' ? F.from75mid : F.from75;
    return Math.round(per * rate);
  }

  // 子の年齢（その年の誕生日の後の年齢。4〜12月生まれとして学年を数える）から段階を決める
  var STAGES = [['kinder', 4, 6], ['elem', 7, 12], ['junior', 13, 15], ['high', 16, 18], ['univ', 19, 22]];
  function stageOf(childAge) {
    for (var i = 0; i < STAGES.length; i++) if (childAge >= STAGES[i][1] && childAge <= STAGES[i][2]) return STAGES[i][0];
    return null;
  }
  function isPrivate(school, stage) {
    if (school === 'pri') return true;
    if (school === 'jr') return stage === 'junior' || stage === 'high';
    if (school === 'hi') return stage === 'high';
    return false;
  }

  /** 子 1 人のその年の教育費（円、今の値段）。childAge は その年 − 生まれた年 */
  function educationYear(kid, childAge) {
    var st = stageOf(childAge);
    if (!st) return 0;
    if (st !== 'univ') return C.gakushuhi.value[st][isPrivate(kid.school, st) ? 'pri' : 'pub'];
    if (kid.univ === 'none') return 0;
    var first = childAge === 19;
    var v;
    if (kid.univ === 'kokuritsu') {
      var n = C.univNational.value;
      v = n.tuition + (first ? n.entrance : 0);
    } else {
      var p = C.univPrivate.value[kid.univ];
      v = p.tuition + p.facility + (first ? p.entrance : 0);
    }
    return v + (kid.away ? C.shiokuri.value : 0);
  }

  // ---------- 年金 ----------
  /** 年金の概算（65歳から受け取るときの年額、円）。income は年収（円）。deps.Ikukyu が要る */
  function pensionEstimate(o, deps) {
    var kiso = Math.round(C.kisoMangaku.value * C.kisoMonths.value / C.kisoMonths.value);   // 40 年すべて納めた前提
    var kosei = 0, months = 0, std = 0;
    if (o.income > 0) {
      var Ik = deps.Ikukyu;
      std = Ik.hyojunKounen(Ik.hyojunFromSalary(Math.floor(o.income / 12)));
      // 平成15年4月以降の加入月数だけ数える（それより前は加入していない前提）
      var joinYear = o.birthYear + o.joinAge;
      var endYear = o.birthYear + Math.min(o.retireAge, 70);
      months = Math.max(0, Math.round((endYear - Math.max(joinYear, 2003.25)) * 12));
      kosei = Math.round(std * C.koseiRate.value / 1000 * months);
    }
    return { kiso: kiso, kosei: kosei, months: months, std: std, total: kiso + kosei };
  }

  /** 受け取り始める年齢による増減の率（seido-keisan の lib/kuriage-values.js の率） */
  function startFactor(start, deps) {
    var K = deps.KuriageValues;
    if (start < 65) return 1 - K.kuriageRate * (65 - start) * 12;
    if (start > 65) return 1 + K.kurisageRate * Math.min(start - 65, K.kurisageMax / 12) * 12;
    return 1;
  }

  /** 公的年金等に係る雑所得（65歳以上・ほかの所得 1,000万円以下） */
  function nenkinShotoku(p) {
    var T = C.nenkinKojo65.value;
    if (p <= T.zeroUpTo) return 0;
    for (var i = 0; i < T.bands.length; i++) {
      var b = T.bands[i];
      if (p < b[0]) return Math.max(0, Math.floor(p * b[1]) - b[2]);
    }
    return 0;
  }

  /**
   * 年金の手取り（所得税・住民税だけを引く。国民健康保険料・介護保険料は市区町村で違うので引かない）
   * 年金のほかに所得がない 1 人暮らしとして、seido-keisan の値と式で 1 回だけ計算する
   */
  function pensionNet(p, deps) {
    if (!(p > 0)) return { zatsu: 0, incomeTax: 0, resident: 0, net: 0, rate: 1 };
    var N = deps.Nenmatsu, TAX = deps.TaxValues, TV = deps.TakeHomeValues, J = deps.Juminzei, JV = deps.JuminzeiValues;
    var zatsu = nenkinShotoku(p);
    // 所得税（令和8年分の基礎控除・速算表・復興特別所得税 102.1%、100円未満切り捨て）
    var ty = TV.taxYear;
    var taxable = Math.floor(Math.max(0, zatsu - N.kisoKojo(zatsu, ty)) / 1000) * 1000;
    var st = taxable > 0 ? N.sokusan(taxable, ty).value : 0;
    var incomeTax = Math.floor(st * TAX.years[ty].fukkou / 100000) * 100;
    // 住民税（標準の税率・1級地。基礎控除・調整控除・均等割・森林環境税・非課税の基準）
    var nd = JV.CURRENT, Y = JV.nendo[nd];
    var kisoJ = 0;
    for (var i = 0; i < Y.kiso.length; i++) if (zatsu <= Y.kiso[i][0]) { kisoJ = Y.kiso[i][1]; break; }
    var tj = Math.floor(Math.max(0, zatsu - kisoJ) / 1000) * 1000;
    var rate = Y.rate.normal;
    var wari = Math.floor(tj * rate.pref / 100) + Math.floor(tj * rate.city / 100);
    if (tj > 0) {
      // 調整控除（地方税法 37条・314条の6）: 人的控除の差は基礎控除の分（5万円）だけ。
      // 合計課税所得金額 200万円以下は min(差, 課税所得)、超えると（差 −（課税所得 − 200万円））だが 5万円を下回れば 5万円 → 1 人暮らしでは常に 5万円
      var base = Y.chosei.base;
      var x = tj <= Y.chosei.line ? Math.min(base, tj) : base;
      var cp = Y.chosei.pct.normal;
      var chosei = Math.floor(x * cp.pref / 100) + Math.floor(x * cp.city / 100);
      wari = Math.max(0, wari - chosei);
    }
    if (zatsu <= J.shotokuwariLimit(0, nd)) wari = 0;
    var kinto = zatsu <= J.kintowariLimit(0, 1, nd) ? 0 : Y.kinto.pref + Y.kinto.city + Y.shinrin;
    var resident = Math.floor(wari / 100) * 100 + kinto;
    var net = p - incomeTax - resident;
    return { zatsu: zatsu, incomeTax: incomeTax, resident: resident, net: net, rate: net / p };
  }

  // ---------- 働いている間の手取り率 ----------
  /** 年収 gross（円）のときの手取り ÷ 年収。seido-keisan の lib/take-home.js をそのまま使う（2,000万円を超える分は 2,000万円の率） */
  function takeHomeRate(gross, o, deps) {
    if (!(gross > 0)) return { rate: 0, net: 0, gross: 0 };
    var T = deps.TakeHome, TAX = deps.TaxValues, TV = deps.TakeHomeValues;
    var g = Math.min(gross, TAX.years[TV.taxYear].maxIncome);
    var r = T.calc({
      period: 'year', amount: g, bonus: 0, over40: o.age >= 40 && o.age < 65,
      spouse: { has: !!o.spouseHas, income: o.spouseIncome || 0 },
      kids: o.kids || { u16: 0, a16: 0, a19: 0 }, juminNow: 'same',
    });
    if (!r.ready) return { rate: 0, net: 0, gross: g };
    return { rate: r.year.net / r.gross, net: r.year.net, gross: r.gross, detail: r.year };
  }

  // ---------- 1 本の筋書きを年ごとに計算する（deps を使わない。率は ctx で受け取る） ----------
  /**
   * @param d   normalizeInput の結果
   * @param ctx { year, takeHomeSelf, takeHomeSpouse, pensionSelf, pensionSpouse, netRateSelf, netRateSpouse }
   *            pension* は受け取り始めた年からの年額（円、増減の率を掛けたあと）
   * @param sc  { expenseMul: 1, rate: 利回り（%） }
   */
  function simulate(d, ctx, sc) {
    sc = sc || {};
    var mul = sc.expenseMul || 1;
    var r = (sc.rate !== undefined ? sc.rate : d.rate) / 100;
    var infl = d.inflation / 100, raise = d.raise / 100;
    var y0 = ctx.year;
    var spAge0 = d.spouse.has ? (d.spouse.age !== null ? d.spouse.age : d.age) : null;
    var balance = yen(d.savings);
    var rows = [];
    var years = Math.max(0, d.endAge - d.age);
    for (var t = 0; t <= years; t++) {
      var year = y0 + t, age = d.age + t, spAge = spAge0 === null ? null : spAge0 + t;
      var f = Math.pow(1 + infl, t);   // 支出に掛ける物価の倍率
      var grow = Math.pow(1 + raise, t);
      // 収入
      var work = 0, pension = 0, other = 0;
      if (age < d.retireAge) work += Math.round(yen(d.income) * grow * ctx.takeHomeSelf);
      if (spAge !== null && spAge < d.retireAge) work += Math.round(yen(d.spouse.income) * grow * ctx.takeHomeSpouse);
      if (age >= d.pension.start) pension += Math.round(ctx.pensionSelf * ctx.netRateSelf);
      if (spAge !== null && spAge >= d.pension.start) pension += Math.round(ctx.pensionSpouse * ctx.netRateSpouse);
      if (age === d.retireAge) other += yen(d.severance);
      var income = work + pension + other;
      // 支出
      var kidsHome = d.kids.filter(function (c) { var a = year - c.birth; return a >= 0 && a <= 17; });
      var persons = 1 + (spAge !== null ? 1 : 0) + kidsHome.length;
      var living = d.living !== null ? yen(d.living) * 12 : livingMonthly(persons, age) * 12;
      var housing = 0, h = d.housing;
      if (h.type === 'rent') {
        housing = yen(h.rent) * 12 + (t % 2 === 1 ? Math.round(yen(h.rent) * h.renewal) : 0);
      } else {
        housing = yen(h.ownCost);
      }
      var edu = 0;
      d.kids.forEach(function (c) { edu += educationYear(c, year - c.birth); });
      var medical;
      if (d.medical !== null) medical = yen(d.medical);
      else {
        medical = medicalYear(age, d.kubun) + (spAge !== null ? medicalYear(spAge, d.kubun) : 0);
        kidsHome.forEach(function (c) { medical += medicalYear(year - c.birth, d.kubun); });
      }
      var kaigo = age >= d.kaigo.from ? yen(d.kaigo.amount) : 0;
      var special = 0;
      d.specials.forEach(function (s) { if (s.year === year) special += yen(s.amount); });
      var other2 = yen(d.car) + yen(d.insurance) + kaigo + special;
      var parts = {
        living: Math.round(living * f * mul), housing: Math.round(housing * f * mul), edu: Math.round(edu * f * mul),
        medical: Math.round(medical * f * mul), other: Math.round(other2 * f * mul),
        loan: h.type === 'own' && t < h.loanYears ? Math.round(yen(h.loan) * 12 * mul) : 0,   // ローンは決まった額なので物価を掛けない
      };
      var expense = parts.living + parts.housing + parts.edu + parts.medical + parts.other + parts.loan;
      var start = balance;
      var gain = start > 0 ? start * r : 0;
      balance = start + gain + income - expense;
      rows.push({
        year: year, age: age, spouseAge: spAge, persons: persons,
        work: work, pension: pension, severance: other, income: income,
        parts: parts, expense: expense, net: income - expense, gain: gain, start: start, balance: balance,
      });
    }
    return rows;
  }

  function summarize(rows, d) {
    var neg = null, at60 = null, edu = 0;
    rows.forEach(function (x) {
      if (neg === null && x.balance < 0) neg = x;
      if (x.age === 60) at60 = x.balance;
      edu += x.parts.edu;
    });
    return {
      negAge: neg ? neg.age : null, negYear: neg ? neg.year : null,
      at60: at60, eduTotal: edu, last: rows.length ? rows[rows.length - 1] : null,
    };
  }

  // ---------- 入力 → 3 つの筋書き ----------
  /** seido-keisan の部品で率を求め、入力どおり／支出 +10%／利回り 0 を計算する */
  function run(raw, deps, thisYear) {
    var year = thisYear || new Date().getFullYear();
    var d = normalizeInput(raw, year);
    if (!ready(d)) return { ready: false, input: d };
    var kidsAt = { u16: 0, a16: 0, a19: 0 };
    d.kids.forEach(function (c) {
      var a = year - c.birth;   // 扶養の区分は 12 月 31 日の年齢（その年 − 生まれた年 − 1 〜 その年 − 生まれた年）。ここでは その年 − 生まれた年 で数える
      if (a >= 0 && a <= 15) kidsAt.u16++;
      else if (a >= 16 && a <= 18) kidsAt.a16++;
      else if (a >= 19 && a <= 22) kidsAt.a19++;
    });
    var spAge = d.spouse.has ? (d.spouse.age !== null ? d.spouse.age : d.age) : null;
    var self = takeHomeRate(yen(d.income), { age: d.age, spouseHas: d.spouse.has, spouseIncome: yen(d.spouse.income), kids: kidsAt }, deps);
    var sp = d.spouse.has ? takeHomeRate(yen(d.spouse.income), { age: spAge }, deps) : { rate: 0, net: 0, gross: 0 };
    var factor = startFactor(d.pension.start, deps);
    var estSelf = pensionEstimate({ income: yen(d.income), birthYear: year - d.age, joinAge: d.pension.joinAge, retireAge: d.retireAge }, deps);
    var estSp = d.spouse.has ? pensionEstimate({ income: yen(d.spouse.income), birthYear: year - spAge, joinAge: d.pension.joinAge, retireAge: d.retireAge }, deps) : null;
    var pSelf = Math.round((d.pension.self !== null ? yen(d.pension.self) : estSelf.total) * factor);
    var pSp = d.spouse.has ? Math.round((d.pension.spouse !== null ? yen(d.pension.spouse) : estSp.total) * factor) : 0;
    var nSelf = pensionNet(pSelf, deps), nSp = pensionNet(pSp, deps);
    var ctx = {
      year: year, takeHomeSelf: self.rate, takeHomeSpouse: sp.rate,
      pensionSelf: pSelf, pensionSpouse: pSp,
      netRateSelf: d.pension.netRate !== null ? d.pension.netRate / 100 : nSelf.rate,
      netRateSpouse: d.pension.netRate !== null ? d.pension.netRate / 100 : nSp.rate,
    };
    var scen = [{ key: 'base', label: '入力どおり', rows: simulate(d, ctx) }];
    scen.push({ key: 'exp10', label: '支出 +10%', rows: simulate(d, ctx, { expenseMul: 1.1 }) });
    if (d.rate !== 0) scen.push({ key: 'rate0', label: '利回り 0%', rows: simulate(d, ctx, { rate: 0 }) });
    scen.forEach(function (s) { s.summary = summarize(s.rows, d); });
    return {
      ready: true, input: d, ctx: ctx, scenarios: scen,
      takeHome: { self: self, spouse: sp },
      pension: { self: estSelf, spouse: estSp, factor: factor, netSelf: nSelf, netSpouse: nSp },
    };
  }

  // ---------- CSV（年ごとの表。Excel で開けるよう BOM つき UTF-8 は画面側で付ける） ----------
  function toCsv(rows) {
    var head = ['年', '本人の年齢', '収入', 'うち勤労', 'うち年金', 'うち退職金', '支出', 'うち生活費', 'うち住まい', 'うちローン', 'うち教育', 'うち医療', 'うちその他', '収支', '年末の残高'];
    var lines = [head.join(',')];
    rows.forEach(function (x) {
      var p = x.parts;
      lines.push([x.year, x.age, x.income, x.work, x.pension, x.severance, x.expense, p.living, p.housing, p.loan, p.edu, p.medical, p.other, x.net, Math.round(x.balance)].join(','));
    });
    return lines.join('\r\n') + '\r\n';
  }

  // --- バックアップファイル（README「ツールを追加するとき」20。決定 D31） ---
  // 形式: { tool, version, exportedAt, data }。data はブラウザに保存しているものと同じ形
  var BACKUP_VERSION = 1;

  /** 書き出すファイル名: <ツール名>-backup-YYYYMMDD.json（日付は端末の時計） */
  function backupFileName(tool, date) {
    var d = date || new Date();
    return tool + '-backup-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
  }

  /** 書き出す中身 */
  function buildBackup(tool, data, date) {
    return { tool: tool, version: BACKUP_VERSION, exportedAt: (date || new Date()).toISOString(), data: data };
  }

  /**
   * 読み込んだファイルの文字列を確かめる。中身の正規化は画面側の既存の関数で行う
   * @returns {{ok: true, data: object} | {ok: false, error: string}} error は画面にそのまま出す文
   */
  function parseBackup(text, tool, requiredKeys) {
    var o;
    try { o = JSON.parse(text); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o) || typeof o.tool !== 'string') {
      return { ok: false, error: 'ファイルを読み取れませんでした。このツールの「ファイルに書き出す」で作った .json ファイルを選んでください。' };
    }
    if (o.tool !== tool) {
      return { ok: false, error: 'ほかのツール（' + o.tool.slice(0, 40) + '）のファイルです。このツールで書き出したファイルを選んでください。' };
    }
    if (o.version !== BACKUP_VERSION) {
      return { ok: false, error: typeof o.version === 'number' && o.version > BACKUP_VERSION
        ? '新しい版のツールで書き出したファイルのため読み込めません。ページを再読み込みしてから、もう一度お試しください。'
        : 'ファイルの形式が正しくないため読み込めません。' };
    }
    var data = o.data;
    var missing = !data || typeof data !== 'object' || Array.isArray(data) ||
      (requiredKeys || []).some(function (k) { return data[k] === undefined || data[k] === null; });
    if (missing) return { ok: false, error: 'ファイルの中身が足りないため読み込めません。' };
    return { ok: true, data: data };
  }

  var api = {
    normalizeInput: normalizeInput, ready: ready, livingMonthly: livingMonthly, medicalYear: medicalYear,
    stageOf: stageOf, educationYear: educationYear, pensionEstimate: pensionEstimate, startFactor: startFactor,
    nenkinShotoku: nenkinShotoku, pensionNet: pensionNet, takeHomeRate: takeHomeRate,
    simulate: simulate, summarize: summarize, run: run, toCsv: toCsv,
    backupFileName: backupFileName, buildBackup: buildBackup, parseBackup: parseBackup,
  };
  if (isNode) module.exports = api;
  else root.Calc = api;
})(this);
