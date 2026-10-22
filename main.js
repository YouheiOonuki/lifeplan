// ===========================
// ライフプラン 簡易シミュレーション — 画面の制御
// 計算は calc.js（純粋関数）、既定値は constants.js、手取り・税の計算は seido-keisan の lib（index.html で読む）
// ===========================
(function () {
  'use strict';

  // --- ブラウザへの保存（キーは必ず "lifeplan_" で始める。全ツールが同じオリジンで localStorage を共有しているため） ---
  var KEY_PREFIX = 'lifeplan_';
  var store = {
    get: function (name, fallback) {
      try {
        var v = localStorage.getItem(KEY_PREFIX + name);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set: function (name, value) {
      try { localStorage.setItem(KEY_PREFIX + name, JSON.stringify(value)); } catch (e) { /* 保存できなくても続ける */ }
    },
  };

  // --- 共有 URL（入力は "#" 以降。サーバーとアクセス解析には届かない） ---
  function toShareHash(state) { return '#s=' + encodeURIComponent(JSON.stringify(state)); }
  function fromShareHash(hash) {
    var m = /^#s=(.+)$/.exec(hash || '');
    if (!m) return null;
    try { return JSON.parse(decodeURIComponent(m[1])); } catch (e) { return null; }
  }

  var Calc = window.Calc;
  var THIS_YEAR = new Date().getFullYear();
  var $ = function (id) { return document.getElementById(id); };
  var deps = {
    TakeHome: window.TakeHome, TakeHomeValues: window.TakeHomeValues, Nenmatsu: window.Nenmatsu, TaxValues: window.TaxValues,
    Juminzei: window.Juminzei, JuminzeiValues: window.JuminzeiValues, Ikukyu: window.Ikukyu, KuriageValues: window.KuriageValues,
  };
  var depsOk = Object.keys(deps).every(function (k) { return !!deps[k]; });

  function radio(name) { var e = document.querySelector('input[name="' + name + '"]:checked'); return e ? e.value : ''; }
  function setRadio(name, v) { document.querySelectorAll('input[name="' + name + '"]').forEach(function (e) { e.checked = e.value === v; }); }
  function val(id) { return $(id).value; }

  // 子の生まれた年: 「2020、2023」「2020,2023」「2020 2023」を受け付ける
  function parseKids(text) {
    return String(text || '').split(/[、,，\s]+/).map(function (s) { return s.replace(/[^\d]/g, ''); })
      .filter(function (s) { return /^\d{4}$/.test(s); }).slice(0, 6).map(Number);
  }

  var kidOpts = [];       // 子ごとの進路（生まれた年の並びと同じ順）
  var specials = [];      // 特別費 [{year, amount}]（文字列のまま持つ）

  // --- 画面の今の入力（保存・共有・書き出しはこの形） ---
  function current() {
    var births = parseKids(val('kids'));
    return {
      age: val('age'), income: val('income'),
      spouse: { has: radio('spouse') === 'yes', income: val('spouse-income'), age: val('spouse-age') },
      kidsText: val('kids'),
      kids: births.map(function (b, i) { var o = kidOpts[i] || {}; return { birth: b, school: o.school || 'pub', univ: o.univ || 'none', away: !!o.away }; }),
      housing: { type: radio('house') || 'rent', rent: val('rent'), loan: val('loan'), loanYears: val('loan-years'), ownCost: val('own-cost'), renewal: val('renewal') },
      retireAge: val('retire-age'), severance: val('severance'),
      pension: { self: val('p-self'), spouse: val('p-spouse'), start: val('p-start'), joinAge: val('join-age'), netRate: val('p-net') },
      living: val('living'), medical: val('medical'), kubun: val('kubun'),
      kaigo: { amount: val('kaigo'), from: val('kaigo-from') },
      car: val('car'), insurance: val('insurance'),
      specials: specials.slice(),
      savings: val('savings'), rate: val('rate'), inflation: val('inflation'), raise: val('raise'), endAge: val('end-age'),
    };
  }

  // 保存データ・共有リンク・ファイルの中身を画面に戻す（中身はそのまま信じず、文字列として長さを切る）
  function s(v, n) { return v === undefined || v === null ? '' : String(v).slice(0, n || 12); }
  function apply(raw) {
    var r = raw && typeof raw === 'object' ? raw : {};
    var sp = r.spouse || {}, h = r.housing || {}, pe = r.pension || {}, k = r.kaigo || {};
    $('age').value = s(r.age); $('income').value = s(r.income);
    setRadio('spouse', sp.has ? 'yes' : 'no');
    $('spouse-income').value = s(sp.income); $('spouse-age').value = s(sp.age);
    $('kids').value = s(r.kidsText !== undefined ? r.kidsText : (Array.isArray(r.kids) ? r.kids.map(function (c) { return c && c.birth; }).join('、') : ''), 60);
    kidOpts = (Array.isArray(r.kids) ? r.kids : []).slice(0, 6).map(function (c) {
      c = c && typeof c === 'object' ? c : {};
      return { school: ['pub', 'hi', 'jr', 'pri'].indexOf(c.school) >= 0 ? c.school : 'pub', univ: ['none', 'kokuritsu', 'bun', 'ri'].indexOf(c.univ) >= 0 ? c.univ : 'none', away: !!c.away };
    });
    setRadio('house', h.type === 'own' ? 'own' : 'rent');
    $('rent').value = s(h.rent); $('loan').value = s(h.loan); $('loan-years').value = s(h.loanYears);
    $('own-cost').value = s(h.ownCost); $('renewal').value = s(h.renewal);
    $('retire-age').value = s(r.retireAge); $('severance').value = s(r.severance);
    $('p-self').value = s(pe.self); $('p-spouse').value = s(pe.spouse); $('p-start').value = s(pe.start);
    $('join-age').value = s(pe.joinAge); $('p-net').value = s(pe.netRate);
    $('living').value = s(r.living); $('medical').value = s(r.medical);
    $('kubun').value = ['ippan', 'ichitei', 'genekinami'].indexOf(r.kubun) >= 0 ? r.kubun : 'ippan';
    $('kaigo').value = s(k.amount); $('kaigo-from').value = s(k.from);
    $('car').value = s(r.car); $('insurance').value = s(r.insurance);
    specials = (Array.isArray(r.specials) ? r.specials : []).slice(0, 20).map(function (x) { x = x || {}; return { year: s(x.year, 4), amount: s(x.amount) }; });
    $('savings').value = s(r.savings); $('rate').value = s(r.rate); $('inflation').value = s(r.inflation); $('raise').value = s(r.raise);
    $('end-age').value = ['80', '85', '90', '95', '100'].indexOf(String(r.endAge)) >= 0 ? String(r.endAge) : '100';
    renderKidRows(); renderSpecials(); toggles();
  }

  // --- 子ごとの進路の行 ---
  var SCHOOL_L = { pub: 'すべて公立', hi: '高校だけ私立', jr: '中学から私立', pri: 'すべて私立' };
  var UNIV_L = { none: '大学なし', kokuritsu: '国立大学', bun: '私立大学（文系）', ri: '私立大学（理系）' };
  function opt(map, v) { return Object.keys(map).map(function (k) { return '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + map[k] + '</option>'; }).join(''); }
  function renderKidRows() {
    var births = parseKids(val('kids'));
    var box = $('kid-rows');
    box.innerHTML = births.map(function (b, i) {
      var o = kidOpts[i] || (kidOpts[i] = { school: 'pub', univ: 'none', away: false });
      return '<fieldset class="kid"><legend>' + (i + 1) + ' 人目（' + b + ' 年生まれ）</legend>' +
        '<div class="row2"><div class="field"><label for="k-s' + i + '">幼稚園〜高校</label><select id="k-s' + i + '" data-k="' + i + '" data-f="school">' + opt(SCHOOL_L, o.school) + '</select></div>' +
        '<div class="field"><label for="k-u' + i + '">大学</label><select id="k-u' + i + '" data-k="' + i + '" data-f="univ">' + opt(UNIV_L, o.univ) + '</select></div></div>' +
        '<label class="check"><input type="checkbox" id="k-a' + i + '" data-k="' + i + '" data-f="away"' + (o.away ? ' checked' : '') + '> 大学は自宅の外から通う（仕送り）</label></fieldset>';
    }).join('');
    $('kid-none').hidden = births.length > 0;
  }
  $('kid-rows').addEventListener('change', function (e) {
    var t = e.target, i = Number(t.getAttribute('data-k')), f = t.getAttribute('data-f');
    if (!f || !kidOpts[i]) return;
    kidOpts[i][f] = f === 'away' ? t.checked : t.value;
    schedule();
  });

  // --- 特別費の行（年と額。何件でも） ---
  // 共有リンクから来た値を属性に入れるので、引用符を外す（K191 段 3 F6）
  function attr(v) { return String(v == null ? '' : v).replace(/[&"<>]/g, function (c) { return { '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function renderSpecials() {
    $('special-rows').innerHTML = specials.map(function (x, i) {
      return '<div class="row2 special"><div class="field"><label for="sp-y' + i + '">年（西暦）</label><input type="number" id="sp-y' + i + '" inputmode="numeric" data-i="' + i + '" data-f="year" value="' + attr(x.year) + '" placeholder="例：' + (THIS_YEAR + 5) + '"></div>' +
        '<div class="field"><label for="sp-a' + i + '">額（万円）</label><input type="number" id="sp-a' + i + '" inputmode="decimal" step="0.1" data-i="' + i + '" data-f="amount" value="' + attr(x.amount) + '" placeholder="例：200"></div>' +
        '<button type="button" class="btn btn-sub sp-del" data-del="' + i + '" aria-label="' + (i + 1) + ' 件目を消す">消す</button></div>';
    }).join('');
  }
  $('special-add').addEventListener('click', function () {
    specials.push({ year: '', amount: '' });
    renderSpecials();
    var n = specials.length - 1;
    $('sp-y' + n).focus();
  });
  $('special-rows').addEventListener('input', function (e) {
    var t = e.target, i = Number(t.getAttribute('data-i')), f = t.getAttribute('data-f');
    if (!f || !specials[i]) return;
    specials[i][f] = t.value.slice(0, 12);
    schedule();
  });
  $('special-rows').addEventListener('click', function (e) {
    var b = e.target.closest('[data-del]');
    if (!b) return;
    specials.splice(Number(b.getAttribute('data-del')), 1);
    renderSpecials(); schedule();
  });

  function toggles() {
    var sp = radio('spouse') === 'yes', own = radio('house') === 'own';
    $('f-spouse-income').hidden = !sp; $('f-spouse-age').hidden = !sp;
    $('f-rent').hidden = own; $('f-own').hidden = !own;
  }

  // --- 表示 ---
  function man(yen) { return Math.round(yen / 10000).toLocaleString('ja-JP'); }
  function manYen(yen) { return man(yen) + ' 万円'; }
  var bar = window.YorozuScreen.fixedBar({ bar: 'fixbar', watch: 'result-main', jump: 'result-card', text: 'fixbar-text' });
  var last = null;

  function chartSvg(res) {
    var sc = res.scenarios, rows0 = sc[0].rows;
    var W = Math.max(320, Math.min(760, $('chart').clientWidth || 640)), H = Math.round(W < 500 ? W * 0.62 : W * 0.42), L = 58, R = 26, T = 14, B = 34;
    var all = []; sc.forEach(function (x) { x.rows.forEach(function (r) { all.push(r.balance); }); });
    all.push(0);
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    if (hi === lo) hi = lo + 1;
    var pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
    var a0 = rows0[0].age, a1 = rows0[rows0.length - 1].age;
    var X = function (age) { return L + (W - L - R) * (a1 === a0 ? 0 : (age - a0) / (a1 - a0)); };
    var Yp = function (v) { return T + (H - T - B) * (hi - v) / (hi - lo); };
    var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="貯蓄残高の推移（年齢ごと）" class="chart-svg">'];
    // 目盛り（縦: 4 本、横: 10 歳ごと）
    var step = niceStep((hi - lo) / 4);
    for (var v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      out.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Yp(v).toFixed(1) + '" y2="' + Yp(v).toFixed(1) + '" class="grid"/>');
      out.push('<text x="' + (L - 6) + '" y="' + (Yp(v) + 4).toFixed(1) + '" class="tick" text-anchor="end">' + man(v) + '</text>');
    }
    for (var g = Math.ceil(a0 / 10) * 10; g <= a1; g += 10) {
      out.push('<text x="' + X(g).toFixed(1) + '" y="' + (H - B + 18) + '" class="tick" text-anchor="middle">' + g + '歳</text>');
    }
    out.push('<text x="' + (L - 6) + '" y="' + (T - 2) + '" class="tick" text-anchor="end">万円</text>');
    out.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Yp(0).toFixed(1) + '" y2="' + Yp(0).toFixed(1) + '" class="zero"/>');
    var cls = ['l-base', 'l-exp', 'l-rate'];
    for (var i = sc.length - 1; i >= 0; i--) {
      var pts = sc[i].rows.map(function (r) { return X(r.age).toFixed(1) + ',' + Yp(r.balance).toFixed(1); }).join(' ');
      out.push('<polyline points="' + pts + '" class="' + cls[i] + '"/>');
    }
    // 入力どおりの線で、残高が 0 を切った年を赤で
    rows0.forEach(function (r, j) {
      if (r.balance < 0 && j > 0) {
        var p = rows0[j - 1];
        out.push('<line x1="' + X(p.age).toFixed(1) + '" y1="' + Yp(p.balance).toFixed(1) + '" x2="' + X(r.age).toFixed(1) + '" y2="' + Yp(r.balance).toFixed(1) + '" class="l-neg"/>');
      }
    });
    var n = sc[0].summary.negAge;
    if (n !== null) out.push('<circle cx="' + X(n).toFixed(1) + '" cy="' + Yp(0).toFixed(1) + '" r="5" class="dot-neg"/>');
    out.push('</svg>');
    return out.join('');
  }
  function niceStep(x) {
    var p = Math.pow(10, Math.floor(Math.log10(Math.max(x, 1))));
    var m = x / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }

  function negText(sum, d) {
    return sum.negAge === null ? d.endAge + ' 歳まで 0 を切りません' : sum.negAge + ' 歳';
  }

  function render(res) {
    var ok = res && res.ready;
    $('kpis').hidden = $('chart-box').hidden = $('scen-box').hidden = !ok;
    $('csv').disabled = $('print').disabled = !ok;
    if (!ok) {
      $('result').textContent = '—';
      $('result-sub').textContent = depsOk ? '4 項目を入れると出ます。' : '制度の計算の部品を読み込めませんでした。ページを開き直してください。';
      $('years').innerHTML = ''; $('basis').innerHTML = '<li>—</li>';
      bar.set('');
      return;
    }
    var d = res.input, base = res.scenarios[0], sm = base.summary;
    if (sm.negAge === null) {
      $('result').textContent = d.endAge + ' 歳まで 0 を切りません';
      $('result-sub').textContent = 'この前提では、' + d.endAge + ' 歳の年末の残高は ' + manYen(sm.last.balance) + 'です。';
    } else {
      $('result').textContent = sm.negAge + ' 歳で残高が 0 を切ります';
      $('result-sub').textContent = 'この前提では ' + sm.negAge + ' 歳（' + sm.negYear + ' 年）で残高が 0 を切ります。';
    }
    $('k-neg').textContent = sm.negAge === null ? 'なし' : sm.negAge + ' 歳';
    $('k-60').textContent = d.age > 60 ? '—（60 歳を過ぎています）' : manYen(sm.at60);
    $('k-edu').textContent = manYen(sm.eduTotal);
    $('chart').innerHTML = chartSvg(res);
    var marks = ['実線', '破線', '点線'];
    $('legend').innerHTML = res.scenarios.map(function (x, i) { return '<span class="lg lg-' + i + '">' + marks[i] + '：' + x.label + '</span>'; }).join('') +
      (sm.negAge !== null ? '<span class="lg lg-neg">赤：0 を切った年</span>' : '');
    $('scen').innerHTML = '<caption>3 つの前提を並べる</caption><thead><tr><th scope="col">前提</th><th scope="col">0 を切る年齢</th><th scope="col">60 歳時点</th><th scope="col">' + d.endAge + ' 歳の年末</th></tr></thead><tbody>' +
      res.scenarios.map(function (x) {
        var q = x.summary;
        return '<tr><th scope="row">' + x.label + '</th><td>' + (q.negAge === null ? 'なし' : q.negAge + ' 歳') + '</td><td>' + (d.age > 60 ? '—' : manYen(q.at60)) + '</td><td' + (q.last.balance < 0 ? ' class="neg"' : '') + '>' + manYen(q.last.balance) + '</td></tr>';
      }).join('') + '</tbody>';
    $('years').innerHTML = '<thead><tr><th scope="col">年</th><th scope="col">年齢</th><th scope="col">収入</th><th scope="col">支出</th><th scope="col">収支</th><th scope="col">年末の残高</th></tr></thead><tbody>' +
      base.rows.map(function (r) {
        return '<tr' + (r.balance < 0 ? ' class="neg"' : '') + '><td>' + r.year + '</td><td>' + r.age + '</td><td>' + man(r.income) + '</td><td>' + man(r.expense) + '</td><td>' + man(r.net) + '</td><td>' + man(r.balance) + '</td></tr>';
      }).join('') + '</tbody><tfoot><tr><td colspan="6">単位：万円（四捨五入）。くわしい内訳は CSV に。</td></tr></tfoot>';
    var th = res.takeHome, pn = res.pension, c = res.ctx;
    var li = [];
    li.push('入力: あなた ' + d.age + ' 歳・年収 ' + d.income + ' 万円' + (d.spouse.has ? '・配偶者あり（年収 ' + (d.spouse.income || 0) + ' 万円）' : '・配偶者なし') +
      '・子 ' + d.kids.length + ' 人・' + (d.housing.type === 'rent' ? '賃貸（家賃 月 ' + d.housing.rent + ' 万円）' : '持ち家（返済 月 ' + d.housing.loan + ' 万円・あと ' + d.housing.loanYears + ' 年）') +
      '・貯蓄 ' + (d.savings || 0) + ' 万円');
    li.push('あなたの手取り率 ' + (th.self.rate * 100).toFixed(1) + '%（年収 ' + manYen(th.self.gross) + ' のとき。制度の計算機の手取りの計算）');
    if (d.spouse.has) li.push('配偶者の手取り率 ' + (th.spouse.rate * 100).toFixed(1) + '%');
    li.push('あなたの年金 ' + manYen(c.pensionSelf) + '／年（' + d.pension.start + ' 歳から' + (d.pension.self === null ? '。基礎年金は満額、厚生年金は ' + pn.self.months + ' か月で概算' : '') + '）、手取り率 ' + (c.netRateSelf * 100).toFixed(1) + '%');
    if (d.spouse.has) li.push('配偶者の年金 ' + manYen(c.pensionSpouse) + '／年、手取り率 ' + (c.netRateSpouse * 100).toFixed(1) + '%');
    li.push('1 年目の生活費 ' + manYen(base.rows[0].parts.living) + '（' + (d.living === null ? '家計調査の平均から住まい・医療・教育を引いた額、' + base.rows[0].persons + ' 人' : '入力') + '）');
    li.push('1 年目の医療費 ' + manYen(base.rows[0].parts.medical) + '・住まい ' + manYen(base.rows[0].parts.housing + base.rows[0].parts.loan));
    li.push('利回り ' + d.rate + '%・物価の上昇率 ' + d.inflation + '%・昇給率 ' + d.raise + '%');
    $('basis').innerHTML = li.map(function (t) { return '<li>' + t + '</li>'; }).join('');
    bar.set(sm.negAge === null ? d.endAge + ' 歳まで 0 を切らない' : sm.negAge + ' 歳で 0 を切る');
  }

  function summaries(d) {
    var y = window.YorozuScreen.detailsSummary;
    var kids = d.kids.length ? d.kids.map(function (k) { return SCHOOL_L[k.school] + '・' + UNIV_L[k.univ]; }).join(' / ') : '子なし';
    y({
      'opt-money': '貯蓄 ' + (d.savings === null ? 0 : d.savings) + ' 万円・利回り ' + d.rate + '%' + (d.inflation ? '・物価 ' + d.inflation + '%' : '') + (d.endAge !== 100 ? '・' + d.endAge + ' 歳まで' : ''),
      'opt-work': d.retireAge + ' 歳で退職' + (d.severance ? '・退職金 ' + d.severance + ' 万円' : '') + '・年金は' + (d.pension.self === null ? '概算' : '入力') + (d.pension.start !== 65 ? '（' + d.pension.start + ' 歳から）' : ''),
      'opt-family': kids,
      'opt-living': (d.living === null ? '家計調査の平均' : '生活費 月 ' + d.living + ' 万円') + (d.car ? '・車' : '') + (d.insurance ? '・保険' : '') + (d.kaigo.amount ? '・介護' : ''),
      'opt-house': d.housing.type === 'rent' ? '更新料 ' + d.housing.renewal + ' か月' : '固定資産税と修繕 ' + (d.housing.ownCost || 0) + ' 万円',
      'opt-special': d.specials.length ? d.specials.length + ' 件' : 'なし',
    });
  }

  function update() {
    timer = null;
    var state = current();
    var res = depsOk ? Calc.run(state, deps, THIS_YEAR) : { ready: false, input: Calc.normalizeInput(state, THIS_YEAR) };
    last = res;
    render(res);
    summaries(res.input);
    // 共有リンクで開いた直後は、端末に残っている入力を上書きしない。触ったら保存する（K191 段 3 F4。loan-sim と同じ形）
    if (!fromShare) store.set('draft', state);
  }
  var timer = null;
  function schedule() { if (timer) clearTimeout(timer); timer = setTimeout(update, 300); }

  $('form').addEventListener('input', function (e) {
    if (e.target.id === 'kids') renderKidRows();
    if (e.target.closest('#kid-rows, #special-rows')) return;
    schedule();
  });
  $('form').addEventListener('change', function (e) {
    if (e.target.name === 'spouse' || e.target.name === 'house') toggles();
    if (e.target.closest('#kid-rows, #special-rows')) return;
    schedule();
  });

  // --- CSV と印刷 ---
  $('csv').addEventListener('click', function () {
    if (!last || !last.ready) return;
    var blob = new Blob(['﻿' + Calc.toCsv(last.scenarios[0].rows)], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    var t = new Date();
    a.download = 'lifeplan-' + t.getFullYear() + String(t.getMonth() + 1).padStart(2, '0') + String(t.getDate()).padStart(2, '0') + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  $('print').addEventListener('click', function () { window.print(); });

  // --- 共有リンク・ファイルへの書き出し・読み込み（D31） ---
  var el = { backupMsg: $('backup-msg') };
  $('share').addEventListener('click', function () {
    var url = location.href.split('#')[0] + toShareHash(current());
    if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function () {});
    history.replaceState(null, '', url);
    el.backupMsg.textContent = 'リンクをコピーしました。入力の内容がリンクの「#」より後ろに入ります。';
  });
  var TOOL = 'lifeplan';
  $('backup-export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(Calc.buildBackup(TOOL, { draft: current() }), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = Calc.backupFileName(TOOL);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    el.backupMsg.textContent = 'ファイルに書き出しました。機種変更のときは、このファイルを新しい端末に移して「ファイルから読み込む」を押してください。';
  });
  $('backup-import').addEventListener('click', function () { $('backup-file').click(); });
  $('backup-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) { el.backupMsg.textContent = 'ファイルが大きすぎます。このツールで書き出したファイルを選んでください。'; return; }
    file.text().then(function (text) {
      var r = Calc.parseBackup(text, TOOL, ['draft']);
      if (!r.ok) { el.backupMsg.textContent = r.error; return; }
      if (!window.confirm('ファイルの内容で、今の入力を置き換えます。よろしいですか？')) return;
      apply(r.data.draft);
      fromShare = false;
      update();
      el.backupMsg.textContent = 'ファイルから読み込みました。';
    }, function () { el.backupMsg.textContent = 'ファイルを読み取れませんでした。'; });
  });

  var shared = fromShareHash(location.hash), fromShare = !!shared;
  document.addEventListener('input', function () { fromShare = false; }, { once: true });
  apply(shared || store.get('draft', {}));
  update();
})();
