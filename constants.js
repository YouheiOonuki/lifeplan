// ===========================
// ライフプラン 簡易シミュレーション — 既定値の表（値・出典・確認日をセットで。ここにだけ書く）
// どの値も下の url の原文（公的統計・法令・日本年金機構の資料）を 2026-10-03 に開いて写した。
// 手取り・社会保険料・所得税・住民税の値は写さず、seido-keisan の値ファイルと計算（lib/*.js）をそのまま読む（calc.js の deps）。
// 年金の繰上げ・繰下げの率も seido-keisan の lib/kuriage-values.js を読む。
// guide.html の「出典の表」はこの表と同じ数字（tests/calc.test.js で突き合わせる）。
// ブラウザでは window.Constants、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var CHECKED = '2026-10-03';   // 下の出典を最後に原文で確かめた日
  var ESTAT_2P = 'https://www.e-stat.go.jp/stat-search/files?tclass=000000330002&cycle=7&year=20250';
  var ESTAT_1P = 'https://www.e-stat.go.jp/stat-search/files?page=1&layout=datalist&toukei=00200561&tstat=000000330001&cycle=7&year=20250&month=0&tclass1=000000330001&tclass2=000000330022&tclass3=000000330023&result_back=1&tclass4val=0';

  // 家計調査の年齢階級別の 1 か月の支出（円）。[年齢の下限, 消費支出, 住居, 保健医療, 教育]
  // 基本の生活費 ＝ 消費支出 − 住居 − 保健医療 − 教育（住まい・医療・教育はこの道具の別の行で数えるので引く）
  var LIVING_2P = [
    [0, 285285, 31971, 13729, 5170],     // 〜34歳
    [35, 309879, 20546, 15114, 10131],   // 35〜39歳
    [40, 334162, 17680, 13373, 21637],   // 40〜44歳
    [45, 360965, 18714, 12498, 30771],   // 45〜49歳
    [50, 379853, 16305, 15411, 38685],   // 50〜54歳
    [55, 353358, 19115, 13820, 20576],   // 55〜59歳
    [60, 340393, 22442, 15923, 5644],    // 60〜64歳
    [65, 314980, 16984, 18488, 2011],    // 65〜69歳
    [70, 289080, 18526, 16725, 374],     // 70〜74歳
    [75, 265966, 17006, 16937, 465],     // 75〜79歳
    [80, 240450, 13881, 17058, 141],     // 80〜84歳
    [85, 236684, 17046, 20190, 204],     // 85歳〜
  ];
  var LIVING_1P = [
    [0, 177542, 35060, 6735, 161],       // 34歳以下
    [35, 198488, 28041, 8084, 0],        // 35〜59歳
    [60, 158546, 13103, 9780, 0],        // 60歳以上
  ];

  var C = {
    // --- 年金 ---
    kisoMangaku: {
      value: 847300, label: '老齢基礎年金の満額（年額、令和8年度）',
      source: '日本年金機構「老齢年金ガイド 令和8年度版」5ページ',
      url: 'https://www.nenkin.go.jp/service/pamphlet/kyufu.files/LK03.pdf', checked: CHECKED,
      note: '847,300円 × 納付月数 ÷ 480月（昭和31年4月2日以後生まれ）。1円未満四捨五入',
    },
    kisoMonths: {
      value: 480, label: '老齢基礎年金の加入可能月数',
      source: '日本年金機構「老齢基礎年金の受給要件・支給開始時期・年金額」',
      url: 'https://www.nenkin.go.jp/service/jukyu/seido/roureinenkin/jukyu-yoken/20150401-02.html', checked: CHECKED,
      note: '20歳から60歳になるまでの40年間（昭和16年4月2日以降生まれ）',
    },
    koseiRate: {
      value: 5.481, label: '老齢厚生年金の報酬比例部分の乗率（平成15年4月以降、1,000分の）',
      source: '日本年金機構「老齢年金ガイド 令和8年度版」6ページ',
      url: 'https://www.nenkin.go.jp/service/pamphlet/kyufu.files/LK03.pdf', checked: CHECKED,
      note: '平均標準報酬額 × 5.481/1000 × 平成15年4月以降の加入月数。平成15年3月以前の式（7.125/1000）は使わない',
    },
    // 公的年金等控除（65歳以上、公的年金等以外の合計所得金額 1,000万円以下）
    // 収入 zeroUpTo 以下は雑所得 0。bands は [収入がこの額未満, 率, 引く額]
    nenkinKojo65: {
      value: { zeroUpTo: 1100000, bands: [[3300000, 1, 1100000], [4100000, 0.75, 275000], [7700000, 0.85, 685000], [10000000, 0.95, 1455000], [Infinity, 1, 1955000]] },
      label: '公的年金等に係る雑所得の速算表（65歳以上）',
      source: '国税庁 タックスアンサー No.1600「公的年金等の課税関係」（令和8年4月1日現在法令等）',
      url: 'https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1600.htm', checked: CHECKED,
      note: '110万円以下 0円、330万円未満 −110万円、410万円未満 ×0.75−27万5千円、770万円未満 ×0.85−68万5千円、1,000万円未満 ×0.95−145万5千円、1,000万円以上 −195万5千円',
    },

    // --- 基本の生活費（家計調査 2025年） ---
    living2p: {
      value: LIVING_2P, label: '二人以上の世帯の1か月の支出（世帯主の年齢階級別、2025年平均）',
      source: '総務省統計局「家計調査 家計収支編 二人以上の世帯 詳細結果表 年次 2025年」第3-2表',
      url: ESTAT_2P, checked: CHECKED,
      note: '消費支出・住居・保健医療・教育の4列を写した',
    },
    living1p: {
      value: LIVING_1P, label: '単身世帯の1か月の支出（年齢階級別、2025年平均）',
      source: '総務省統計局「家計調査 家計収支編 単身世帯 詳細結果表 年次 2025年」第2表',
      url: ESTAT_1P, checked: CHECKED,
      note: '34歳以下・35〜59歳・60歳以上の3区分',
    },

    // --- 教育（1 年あたり。学校教育費・学校給食費・学校外活動費の合計） ---
    gakushuhi: {
      value: {
        kinder: { pub: 184646, pri: 347338 },
        elem: { pub: 366599, pri: 1741516 },
        junior: { pub: 542450, pri: 1560359 },
        high: { pub: 596954, pri: 1179261 },
      },
      label: '子供の学習費（学習費総額、令和5年度、訂正後）',
      source: '文部科学省「令和５年度子供の学習費調査結果のポイント」表1（令和8年1月16日）',
      url: 'https://www.mext.go.jp/content/20260116-mxt_chousa01-000039333_1.pdf', checked: CHECKED,
      note: '高校は全日制。令和6年12月の公表値のうち公立小・私立小・公立中・公立高・私立高は訂正後の値',
    },
    univNational: {
      value: { tuition: 535800, entrance: 282000 },
      label: '国立大学の授業料（年額）と入学料の標準額',
      source: '国立大学等の授業料その他の費用に関する省令（e-Gov 法令検索）2条の表',
      url: 'https://laws.e-gov.go.jp/law/416M60000080016', checked: CHECKED,
      note: '大学の学部。大学ごとの額はこれを標準として国立大学法人が定める',
    },
    univPrivate: {
      value: {
        bun: { tuition: 850392, entrance: 219951, facility: 141892 },
        ri: { tuition: 1195313, entrance: 245362, facility: 161378 },
      },
      label: '私立大学の授業料・入学料・施設設備費（令和7年度入学者の平均）',
      source: '文部科学省「私立大学等の令和7年度入学者に係る学生納付金等調査結果について」資料1',
      url: 'https://www.mext.go.jp/a_menu/koutou/shinkou/07021403/1412031_00006.htm', checked: CHECKED,
      note: '文科系学部・理科系学部。2年目からも授業料と施設設備費を同じ額で数える',
    },
    shiokuri: {
      value: 958000, label: '自宅外から通う大学生への仕送り（年額の平均）',
      source: '日本政策金融公庫「教育費負担の実態調査結果」（2021年12月20日）',
      url: 'https://www.jfc.go.jp/n/findings/pdf/kyouikuhi_chousa_k_r03.pdf', checked: CHECKED,
      note: '年間平均95.8万円（在学費用を除く）。2026-10-03 時点で見つかった最新の公表',
    },

    // --- 医療（人口一人当たり国民医療費 × 自己負担の割合） ---
    iryohi: {
      value: [[0, 195400], [15, 148300], [45, 306800], [65, 797200], [70, 864900], [75, 953800]],
      label: '人口一人当たり国民医療費（年齢階級別、令和5年度）',
      source: '厚生労働省「令和5（2023）年度 国民医療費の概況」結果の概要 表5',
      url: 'https://www.mhlw.go.jp/toukei/saikin/hw/k-iryohi/23/dl/R05kekka.pdf', checked: CHECKED,
      note: '0〜14歳 195.4千円、15〜44歳 148.3千円、45〜64歳 306.8千円、65歳以上 797.2千円、70歳以上 864.9千円、75歳以上 953.8千円（70・75歳以上は再掲の値を使う）',
    },
    futan: {
      value: { preschool: 0.2, under70: 0.3, from70: 0.2, from75: 0.1, from75mid: 0.2, genekinami: 0.3 },
      label: '医療費の自己負担の割合',
      source: '厚生労働省「医療費の一部負担（自己負担）割合について」',
      url: 'https://www.mhlw.go.jp/content/000937919.pdf', checked: CHECKED,
      note: '6歳（義務教育就学前）未満 2割、70歳未満 3割、70〜74歳 2割（現役並み 3割）、75歳以上 1割（一定以上所得 2割、現役並み 3割）',
    },

    // --- 使い方ページに参考として出すだけ（既定値にはしない） ---
    taishokukinRef: {
      value: { daigaku: 18960000, kokoJimu: 16820000, kokoGenba: 11830000 },
      label: '定年退職者1人平均退職給付額（勤続20年以上かつ45歳以上、参考）',
      source: '厚生労働省「令和5年就労条件総合調査の概況」退職給付の支給実態 第22表',
      url: 'https://www.mhlw.go.jp/toukei/itiran/roudou/jikan/syurou/23/dl/gaiyou04.pdf', checked: CHECKED,
      note: '大学・大学院卒（管理・事務・技術職）1,896万円、高校卒（管理・事務・技術職）1,682万円、高校卒（現業職）1,183万円',
    },
  };

  // 統計ではなく、この道具が置いた仮定（画面の「くわしい設定」で変える。出典は無い）
  var ASSUME = {
    retireAge: 65,        // 退職の年齢
    joinAge: 22,          // 厚生年金に入った年齢（概算の加入月数に使う）
    pensionStart: 65,     // 年金を受け取り始める年齢
    renewalMonths: 1,     // 賃貸の更新料（2 年に 1 回、家賃の何か月分）
    rate: 0,              // 資産の利回り（%）。既定は 0（推す値を置かない。ROADMAP 7.22）
    inflation: 0,         // 物価の上昇率（%）
    raise: 0,             // 昇給率（%）
    endAge: 100,          // 何歳まで見るか
  };
  // 値の行だけを列挙できるようにする（tests は Object.entries で全行の source・url・checked を確かめる）
  Object.defineProperty(C, 'ASSUME', { value: ASSUME, enumerable: false });
  Object.defineProperty(C, 'CHECKED', { value: CHECKED, enumerable: false });
  Object.defineProperty(C, 'STALE_MONTHS', { value: 12, enumerable: false });

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
  else root.Constants = C;
})(this);
