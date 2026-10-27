// ============================================================================
// 画面ごとの操作ガイド(ポップアップで順に表示する手順)
//
// 1ツアー = 1画面。pathname で引く。
// step.target は画面側の data-guide 属性の値。該当要素が無い(条件付き表示など)
// ときはスポットライト無しで案内文だけを表示する。
// ============================================================================

export interface GuideStep {
  /** data-guide="..." の値。省略時は画面中央に案内のみ */
  target?: string;
  title: string;
  body: string;
}

export interface GuideTour {
  /** 既読管理のキー(pathname と同じにしている) */
  id: string;
  /** 画面名 */
  title: string;
  steps: GuideStep[];
}

const TOURS: GuideTour[] = [
  {
    id: "/login",
    title: "ログイン",
    steps: [
      {
        title: "ようこそ",
        body: "このアプリは試作版のため、パスワードなしで名前を選ぶだけでログインできます。データはこのブラウザの中にだけ保存されます。",
      },
      {
        target: "login-list",
        title: "誰でログインするか",
        body: "緑の「出退勤」が従業員、青の「管理者」が社長です。まずは従業員「山田 一郎」で出勤の流れを見て、次に「社長 太郎」で管理者画面を見るのがおすすめです。",
      },
      {
        title: "いつでも見直せます",
        body: "各画面の右上「？」ボタンを押すと、この案内をもう一度表示できます。",
      },
    ],
  },
  {
    id: "/employee",
    title: "従業員ホーム",
    steps: [
      {
        title: "従業員の画面です",
        body: "現場に着いたらこの画面で出勤を押します。大きなボタンだけで一日の記録が終わるように作っています。",
      },
      {
        target: "header-online",
        title: "通信状態",
        body: "電波の無い現場でも打刻できます。オフラインのときは「未同期」と表示され、電波が戻ると自動で同期します。",
      },
      {
        target: "emp-handover",
        title: "引き継ぎ",
        body: "前日の作業者からの引き継ぎです。「既読にする」と24時間後に自動で消えます。「＋ 書き込む」でいつでも追記できます。",
      },
      {
        target: "emp-site",
        title: "今日の現場",
        body: "今日割り当てられている現場です。複数あるときはここで選んでから出勤します。",
      },
      {
        target: "emp-main",
        title: "出勤・休憩・退勤",
        body: "「出勤」を押すとアルコールチェックの確認が出ます。「異常なし」で打刻、「検出あり」でも記録は必ず残ります。出勤後はこの場所が「休憩開始／終了」「退勤」に変わります。",
      },
      {
        target: "emp-next",
        title: "次の出勤予定",
        body: "直近3回分の予定です。「シフト確認」を押すと月全体をカレンダーで見られます。",
      },
    ],
  },
  {
    id: "/employee/clockout",
    title: "退勤",
    steps: [
      {
        target: "clockout-summary",
        title: "今日の実労働",
        body: "出勤からいままでの実労働時間(休憩を除く)の見込みです。残業があれば赤字で出ます。",
      },
      {
        target: "clockout-handover",
        title: "引き継ぎを残す",
        body: "翌日の作業者と社長に伝えたいことを書けます。空欄のままでも退勤できます。",
      },
      {
        target: "clockout-button",
        title: "退勤を確定",
        body: "「退勤する」→「はい、退勤」の2段階で確定します。確定するとホームに戻り「本日の勤務は終了しました」と表示されます。",
      },
    ],
  },
  {
    id: "/employee/shift",
    title: "シフト確認",
    steps: [
      {
        target: "shift-calendar",
        title: "自分のシフト",
        body: "◯が出勤日、×がシフトなしです。日付を押すと、その日の現場と時間帯が下に表示されます。",
      },
    ],
  },
  {
    id: "/employee/leave",
    title: "シフト希望",
    steps: [
      {
        title: "休み希望を出す画面",
        body: "翌月以降の休み希望を社長に提出します。社長が「設定」で表示をオンにしたときだけメニューに出ます。",
      },
      {
        target: "leave-brush",
        title: "マークを選んで日を押す",
        body: "① マーク(× 休みたい／▲ できれば休みたい／△ 短時間)を選び、② カレンダーの日を押します。続けて何日でも押せます。",
      },
      {
        target: "leave-submit",
        title: "提出",
        body: "最後に「この内容で提出する」を押すと、社長のシフト作成画面にそのまま表示されます。",
      },
    ],
  },
  {
    id: "/employee/notices",
    title: "お知らせ・引き継ぎ",
    steps: [
      {
        title: "一覧で確認",
        body: "直近24時間の引き継ぎと、社長からのお知らせをまとめて確認できます。",
      },
    ],
  },
  {
    id: "/admin",
    title: "管理者ホーム",
    steps: [
      {
        title: "社長(管理者)の画面です",
        body: "本日から5日分の出勤予定が、日ごと・現場ごとに並びます。今日の列だけは実際の打刻状況が反映されます。",
      },
      {
        target: "admin-board",
        title: "出勤予定ボード",
        body: "左端が今日です。名前の横の ● は出勤中、▲ は遅刻、⚠ は未出勤、済 は退勤済み。名前をタップすると現場を変更できます。",
      },
      {
        target: "admin-board",
        title: "予定を動かす",
        body: "現場名の右の「＋」で空いている人を追加、「✕」でその日からその現場を外します。カード下の「＋ 現場」で現場を追加(新規作成も可)できます。",
      },
      {
        target: "admin-menu-main",
        title: "よく使う機能",
        body: "月単位でシフトを組む「シフト管理」と、従業員にお知らせを出す「通達配信」です。",
      },
      {
        target: "admin-menu-small",
        title: "その他の機能",
        body: "デモでは「今どこにいる」「アルコール記録簿」「日次出勤表」が見どころです。各画面でも右上「？」から案内が出ます。",
      },
    ],
  },
  {
    id: "/admin/shifts",
    title: "シフト作成",
    steps: [
      {
        title: "月単位でシフトを組む画面",
        body: "ここで編集した内容は「下書き」です。「更新する」を押すまで従業員には見えません。",
      },
      {
        target: "shifts-employees",
        title: "① 作業員を選ぶ",
        body: "左で作業員を選ぶと、現場と時間帯の入力欄が出ます。",
      },
      {
        target: "shifts-calendar",
        title: "② 日を押して配置",
        body: "カレンダーの日を押すとその日に配置されます。もう一度押すと解除。◯ は配置済み、⚠ は時間の重複です。",
      },
      {
        target: "shifts-side",
        title: "③ 休み希望と出勤予定",
        body: "選んだ日の休み希望(× ▲ △)と出勤予定者が右に出ます。「未反映」の印は下書きの状態です。",
      },
      {
        target: "shifts-bar",
        title: "④ 更新して反映",
        body: "「更新する」で本番シフトに反映します。「下書き保存」で最大3件まで途中保存でき、「変更を破棄」で元に戻せます。",
      },
    ],
  },
  {
    id: "/admin/working",
    title: "今どこにいる",
    steps: [
      {
        title: "いま出勤中の人",
        body: "この瞬間に出勤中の人を現場ごとに表示します。休憩中かどうか、アルコールチェックの実施状況もひと目で分かります。",
      },
    ],
  },
  {
    id: "/admin/attendance-sheet",
    title: "日次出勤表",
    steps: [
      {
        target: "sheet-controls",
        title: "日付を選ぶ",
        body: "選んだ日の出勤者を、紙の出勤表と同じ様式でプレビューします。",
      },
      {
        target: "sheet-export",
        title: "Excel出力",
        body: "同じ様式の Excel ファイルをダウンロードします。空欄は手書き用に残しています。",
      },
    ],
  },
  {
    id: "/admin/alcohol-checks",
    title: "アルコールチェック記録簿",
    steps: [
      {
        title: "記録簿の画面",
        body: "出勤前のアルコールチェック結果を月ごとに一覧します。法令で1年間の保存が求められる項目をそろえています。",
      },
      {
        target: "alc-summary",
        title: "月と件数",
        body: "月を切り替え、記録／検出あり／未実施の件数を確認します。「検出あり・未実施のみ」で問題のある行だけに絞れます。",
      },
      {
        target: "alc-table",
        title: "一覧の見かた",
        body: "赤い行が「検出あり」、オレンジの「未実施」は出勤したのに記録が無い日です。「修正」で確認者を変更できます。",
      },
      {
        target: "alc-export",
        title: "Excel出力",
        body: "表示中の月の記録簿を Excel でダウンロードします。",
      },
    ],
  },
  {
    id: "/admin/notices",
    title: "通達配信",
    steps: [
      {
        target: "notices-form",
        title: "お知らせを作る",
        body: "タイトルと本文を入れて「配信する」。「重要」にチェックすると、従業員の出勤画面に赤枠で常に表示されます。",
      },
    ],
  },
  {
    id: "/admin/employees",
    title: "従業員マスター",
    steps: [
      {
        title: "従業員の登録",
        body: "「＋ 追加」で従業員を登録、「編集」で氏名変更や退職処理ができます。退職にするとログイン画面から消えます。",
      },
    ],
  },
  {
    id: "/admin/sites",
    title: "現場マスター",
    steps: [
      {
        title: "現場の登録",
        body: "現場の追加・編集を行います。出勤予定ボードで名前だけ作った現場も、ここで住所や担当者を補えます。",
      },
    ],
  },
  {
    id: "/admin/reports",
    title: "レポート",
    steps: [
      {
        title: "月間集計",
        body: "月間の出勤日数・労働時間を集計し、規定時間に対する過不足を判定します。CSV で出力できます。",
      },
    ],
  },
  {
    id: "/admin/audit",
    title: "監査ログ",
    steps: [
      {
        title: "変更履歴",
        body: "誰が・いつ・何を変更したかの履歴です。アプリ内の操作はすべて自動で記録され、削除できません。",
      },
    ],
  },
  {
    id: "/admin/attendance",
    title: "出勤簿・打刻修正",
    steps: [
      {
        title: "出勤簿(勤怠台帳)",
        body: "従業員ごとの日別の始業・終業・休憩・労働時間です。労基署の調査ではこの帳票を見せます。",
      },
      {
        target: "ledger-stale",
        title: "退勤忘れ",
        body: "未退勤のまま残っている日はここに出ます。押すと修正画面が開きます。",
      },
      {
        target: "ledger-table",
        title: "日別の記録と修正",
        body: "各行の「修正」で出勤・退勤・休憩を直せます。理由が必須で、修正履歴と監査ログに残ります。",
      },
      {
        target: "ledger-export",
        title: "Excel出力",
        body: "全員分を1冊(従業員ごとにシート)で出力できます。",
      },
    ],
  },
  {
    id: "/admin/paid-leave",
    title: "年休管理簿",
    steps: [
      {
        target: "pl-summary",
        title: "年次有給休暇管理簿",
        body: "付与・取得・残日数と、年5日取得義務の達成状況を一覧します。「明細」で付与・取得を登録できます。",
      },
    ],
  },
  {
    id: "/admin/compliance",
    title: "労務チェック",
    steps: [
      {
        target: "comp-controls",
        title: "月ごとの労務チェック",
        body: "連続勤務・週1日の休日・36協定(月45h/年360h/月100h/複数月平均80h)・年休5日を実績からチェックします。CSV で出力できます。",
      },
    ],
  },
  {
    id: "/admin/settings",
    title: "設定",
    steps: [
      {
        target: "settings-shift-pref",
        title: "シフト希望の表示",
        body: "従業員メニューに「シフト希望」ボタンを出すかどうかの切り替えです。",
      },
      {
        target: "settings-labor",
        title: "労務チェックの基準",
        body: "36協定の上限や法定休日の曜日をここで変更できます。",
      },
      {
        target: "settings-backup",
        title: "バックアップ",
        body: "データはブラウザの中だけにあります。JSON で書き出して保管し、必要なら復元できます。",
      },
      {
        target: "settings-demo",
        title: "デモ用の操作",
        body: "画面の案内をもう一度表示したり、サンプルデータを初期状態に戻せます。デモの前後にお使いください。",
      },
    ],
  },
];

const TOUR_BY_PATH = new Map(TOURS.map((t) => [t.id, t]));

/** pathname に対応するツアー。無ければ null */
export function tourForPath(pathname: string | null): GuideTour | null {
  if (!pathname) return null;
  const normalized =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return TOUR_BY_PATH.get(normalized) ?? null;
}
