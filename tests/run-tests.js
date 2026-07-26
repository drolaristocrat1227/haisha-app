/*
 * 配車アプリのテスト
 *   実行:  npm test
 *
 * 本物の index.html を jsdom で起動して、アプリの関数をそのまま呼んで検証している。
 * 仕様を変えたら、まずここのテストを直してから実装に手を入れると安全。
 */
const { boot, style } = require('./harness');
const { describe, it, check, eq, run } = require('./runner');
const F = require('./fixtures');

/* ============================================================
   自動配車
   ============================================================ */
describe('自動配車：基本', () => {
  it('参加者全員がどこかに配置される', () => {
    const api = boot({ settings: F.settings(), session: F.session({ attending: F.ALL_ADULTS }) });
    api.runAutoAssign();
    const placed = new Set();
    api.SS.vehicles.forEach(v => v.slots.forEach(s => s && placed.add(s.personId)));
    F.ALL_PARENTS.forEach(p => check(placed.has(p), p + ' が配置されていない\n      ' + api.dump()));
  });

  it('運転手が乗っていない車は作られない', () => {
    const api = boot({ settings: F.settings(), session: F.session({ attending: F.ALL_ADULTS }) });
    api.runAutoAssign();
    api.SS.vehicles.forEach(v => {
      if (v.typeName === '運転手が足りません') return;
      check(v.slots[0], v.typeName + ' に運転手がいない\n      ' + api.dump());
    });
  });

  it('同じ人が二重に配置されない', () => {
    const api = boot({ settings: F.settings(), session: F.session({ attending: F.ALL_ADULTS }) });
    api.runAutoAssign();
    const seen = new Set();
    api.SS.vehicles.forEach(v => v.slots.forEach(s => {
      if (!s || s.personId === '__dummy__') return;
      check(!seen.has(s.personId), s.name + ' が二重に配置されている\n      ' + api.dump());
      seen.add(s.personId);
    }));
  });

  it('乗車人数のルールを守る（4・5人乗り→4名 / 6〜8人乗り→6名）', () => {
    const api = boot({ settings: F.settings(), session: F.session({ attending: F.ALL_ADULTS }) });
    api.runAutoAssign();
    api.SS.vehicles
      .filter(v => v.typeName === '父兄号' || v.typeName === '選手号')
      .forEach(v => {
        const occ = v.slots.filter(Boolean).length;
        const lim = v.capacity >= 6 ? 6 : Math.min(v.capacity, 4);
        check(occ <= lim, v.typeName + '(定員' + v.capacity + ') に ' + occ + '名 乗っている（上限' + lim + '）');
      });
  });

  it('運転手が見つからない車には誰も乗せない', () => {
    // 車を持っている父兄が1人もいない状態で、父兄号を手動で置いてある場合
    const s = F.settings();
    s.groups.forEach(g => g.people.forEach(p => { delete p.car; }));
    const api = boot({ settings: s, session: F.session({
      attending: F.ALL_ADULTS, vehicles: [F.vehicle('父兄号', 5)]
    }) });
    api.runAutoAssign();
    api.SS.vehicles.forEach(v => {
      if (v.typeName === '運転手が足りません') return;
      const riders = v.slots.filter(Boolean).length;
      if (!v.slots[0]) {
        eq(riders, 0, v.typeName + ' に運転手がいないのに ' + riders + '名 乗っている\n      ' + api.dump());
      }
    });
  });

  it('運転できる人が足りないときは「運転手が足りません」に集める', () => {
    // 車を持つ父兄が1人だけ。全員は乗り切れない
    const s = F.settings();
    s.groups[2].people = [F.person('a1', '父兄A1', 4), F.person('a4', '父兄A4'), F.person('a5', '父兄A5'),
      F.person('a6', '父兄A6'), F.person('a7', '父兄A7'), F.person('a8', '父兄A8')];
    s.groups[3].people = [];
    const api = boot({ settings: s, session: F.session({ attending: ['a1', 'a4', 'a5', 'a6', 'a7', 'a8'] }) });
    api.runAutoAssign();
    const short = api.SS.vehicles.find(v => v.typeName === '運転手が足りません');
    check(!!short, '「運転手が足りません」が作られていない\n      ' + api.dump());
    check(short.slots.length > 0, '乗り切れなかった人が入っていない');
  });
});

describe('自動配車：手動配置を引き継ぐ', () => {
  const withManual = () => boot({
    settings: F.settings(),
    session: F.session({
      attending: F.ALL_ADULTS,
      vehicles: [
        Object.assign(F.vehicle('チームバス', 25), {
          slots: [F.seat('s1', 'スタッフA', 'g_staff')].concat(Array(24).fill(null))
        }),
        Object.assign(F.vehicle('チームトラック', 2), {
          slots: [F.seat('a4', '父兄A4'), F.seat('a5', '父兄A5')]
        })
      ]
    })
  });

  it('手動で置いた運転手と同乗者がそのまま残る', () => {
    const api = withManual();
    api.runAutoAssign();
    const bus = api.SS.vehicles.find(v => v.typeName === 'チームバス');
    const trk = api.SS.vehicles.find(v => v.typeName === 'チームトラック');
    eq(bus.slots[0].personId, 's1', 'バスの運転手が変わってしまった');
    eq(trk.slots[0].personId, 'a4', 'トラックの運転手が変わってしまった');
    eq(trk.slots[1].personId, 'a5', 'トラックの同乗者が消えた');
  });

  it('手動配置の人が他の車にも現れない', () => {
    const api = withManual();
    api.runAutoAssign();
    const seen = new Set();
    api.SS.vehicles.forEach(v => v.slots.forEach(s => {
      if (!s || s.personId === '__dummy__') return;
      check(!seen.has(s.personId), s.name + ' が二重に配置されている\n      ' + api.dump());
      seen.add(s.personId);
    }));
  });

  it('続けて2回実行しても車が増えず手動配置も保たれる', () => {
    const api = withManual();
    api.runAutoAssign();
    const n1 = api.SS.vehicles.length;
    api.runAutoAssign();
    eq(api.SS.vehicles.length, n1, '2回目で車の数が変わった');
    eq(api.SS.vehicles.find(v => v.typeName === 'チームトラック').slots[0].personId, 'a4',
      '2回目で手動配置の運転手が消えた');
  });
});

describe('自動配車：マネージャーの優先配車', () => {
  it('チームトラックがあれば運転席以外へ乗せる', () => {
    const s = F.settings();
    s.managerList = ['a6'];
    const api = boot({ settings: s, session: F.session({
      attending: F.ALL_ADULTS, vehicles: [F.vehicle('チームトラック', 2), F.vehicle('軽トラ', 2)]
    }) });
    api.runAutoAssign();
    const trk = api.SS.vehicles.find(v => v.typeName === 'チームトラック');
    eq(trk.slots[1].personId, 'a6', 'マネージャーがトラックの助手席にいない\n      ' + api.dump());
  });

  it('チームトラックが無ければ軽トラへ乗せる', () => {
    const s = F.settings();
    s.managerList = ['a6'];
    const api = boot({ settings: s, session: F.session({
      attending: F.ALL_ADULTS, vehicles: [F.vehicle('軽トラ', 2)]
    }) });
    api.runAutoAssign();
    const kei = api.SS.vehicles.find(v => v.typeName === '軽トラ');
    eq(kei.slots[1].personId, 'a6', 'マネージャーが軽トラの助手席にいない\n      ' + api.dump());
  });
});

/* ============================================================
   参加者選択
   ============================================================ */
describe('参加者選択：乗車済みのロック', () => {
  const setup = () => boot({
    settings: F.settings(),
    session: F.session({
      vehicles: [
        Object.assign(F.vehicle('チームトラック', 2), { slots: [F.seat('a4', '父兄A4'), null] }),
        Object.assign(F.vehicle('父兄号', 5), {
          autoCreated: true, slots: [F.seat('a1', '父兄A1')].concat(Array(4).fill(null))
        })
      ]
    })
  });

  it('手動で乗せた人はロックされる', () => {
    check(setup().lockedAttendeeIds().has('a4'), '手動配置の人がロックされていない');
  });

  it('自動生成の車に乗っている人はロックしない（組み直すため）', () => {
    check(!setup().lockedAttendeeIds().has('a1'), '自動生成の車の人までロックされている');
  });

  it('画面を開くと乗車済みの人が参加者に入る', () => {
    const api = setup();
    api.openAttendance();
    check(api.SS.attending.includes('a4'), '乗車済みの人が参加者に入っていない');
    check(!api.SS.attending.includes('a1'), '自動生成の車の人まで参加者に入っている');
  });

  /** 参加者画面を開いて、指定したグループのタブに切り替える */
  function openTab(api, groupName) {
    api.openAttendance();
    const tab = [...api.document.querySelectorAll('#att-tabs .tab-btn')]
      .find(b => b.textContent.startsWith(groupName));
    check(!!tab, groupName + ' のタブが見つからない');
    tab.onclick();
  }

  it('ロック中の人はタップしても外れない', () => {
    const api = setup();
    openTab(api, '3年');               // a4 が乗っているグループ
    const item = [...api.document.querySelectorAll('#att-list .att-item')]
      .find(el => el.classList.contains('att-locked'));
    check(!!item, 'ロック表示の行が無い');
    item.onclick();
    check(api.SS.attending.includes('a4'), 'ロック中なのに外れてしまった');
  });

  it('「全員外す」でもロック中の人は残る', () => {
    const api = setup();
    openTab(api, '3年');
    // 3年グループを全員選択済みにして「全員外す」を出す
    ['a1', 'a2', 'a3', 'a5', 'a6'].forEach(id => {
      if (!api.SS.attending.includes(id)) api.SS.attending.push(id);
    });
    api.renderAttList();
    const btn = api.document.querySelector('#att-list .att-sel-all');
    eq(btn.textContent, '全員外す', '一括ボタンの表示が想定と違う');
    btn.onclick();
    check(api.SS.attending.includes('a4'), 'ロック中の人まで外れてしまった');
    check(!api.SS.attending.includes('a1'), 'ロックしていない人が外れていない');
  });
});

/* ============================================================
   タップ操作
   ============================================================ */
describe('タップ操作：配置・移動・入れ替え', () => {
  const setup = () => boot({
    settings: F.settings(),
    session: F.session({ vehicles: [F.vehicle('チームトラック', 2), F.vehicle('父兄号', 5)] })
  });

  it('名前カード → 空席 の順で配置できる', () => {
    const api = setup();
    api.tapCard('a1', 'g_p3', '父兄A1');
    eq(api.TAP.kind, 'card', 'カードが選択されていない');
    api.tapSlot(0, 0);
    eq(api.SS.vehicles[0].slots[0].personId, 'a1', '配置されていない');
    eq(api.TAP.kind, null, '配置後も選択が残っている');
  });

  it('空席 → 名前カード の順でも配置できる', () => {
    const api = setup();
    api.tapSlot(1, 2);
    eq(api.TAP.kind, 'empty', '空席が選択されていない');
    api.tapCard('a2', 'g_p3', '父兄A2');
    eq(api.SS.vehicles[1].slots[2].personId, 'a2', '選んだ空席に入っていない');
  });

  it('座席 → 空席 で移動できる', () => {
    const api = setup();
    api.SS.vehicles[0].slots[1] = F.seat('a2', '父兄A2');
    api.renderAll();
    api.tapSlot(0, 1);
    api.tapSlot(1, 3);
    eq(api.SS.vehicles[0].slots[1], null, '元の座席が空いていない');
    eq(api.SS.vehicles[1].slots[3].personId, 'a2', '移動先に入っていない');
  });

  it('座席 → 座席 で入れ替わる', () => {
    const api = setup();
    api.SS.vehicles[0].slots[1] = F.seat('a2', '父兄A2');
    api.SS.vehicles[1].slots[1] = F.seat('a3', '父兄A3');
    api.renderAll();
    api.tapSlot(0, 1);
    api.tapSlot(1, 1);
    eq(api.SS.vehicles[0].slots[1].personId, 'a3', '入れ替わっていない');
    eq(api.SS.vehicles[1].slots[1].personId, 'a2', '入れ替わっていない');
  });

  it('同じところを再タップで選択解除できる', () => {
    const api = setup();
    api.tapCard('a1', 'g_p3', '父兄A1');
    api.tapCard('a1', 'g_p3', '父兄A1');
    eq(api.TAP.kind, null, 'カードの再タップで解除されない');
    api.tapSlot(0, 0);
    api.tapSlot(0, 0);
    eq(api.TAP.kind, null, '座席の再タップで解除されない');
  });

  it('「座席から外す」で名前カードに戻る', () => {
    const api = setup();
    api.SS.vehicles[0].slots[0] = F.seat('a1', '父兄A1');
    api.renderAll();
    api.tapSlot(0, 0);
    api.document.getElementById('tapBarRemove').onclick();
    eq(api.SS.vehicles[0].slots[0], null, '座席が空いていない');
    const card = [...api.document.querySelectorAll('.person-card')].find(c => c.dataset.pid === 'a1');
    check(card && !card.classList.contains('assigned'), 'カードが未配置に戻っていない');
  });

  it('運転席の定員オーバーは配置を断り、選択を保つ', () => {
    // 5人乗りの父兄A1が運転 → 同乗5名は乗せられない
    const api = boot({
      settings: F.settings(),
      session: F.session({ vehicles: [Object.assign(F.vehicle('父兄号', 8), {
        slots: [null, F.seat('x1', 'X1'), F.seat('x2', 'X2'), F.seat('x3', 'X3'),
          F.seat('x4', 'X4'), F.seat('x5', 'X5'), null, null] })] })
    });
    api.tapCard('a1', 'g_p3', '父兄A1');
    api.tapSlot(0, 0);
    eq(api.SS.vehicles[0].slots[0], null, '定員オーバーなのに配置された');
    eq(api.TAP.kind, 'card', '失敗時に選択が消えている');
  });

  it('定員の外の座席を指定しても壊れない', () => {
    const api = setup();
    api.tapSlot(0, 99);
    eq(api.TAP.kind, null, '存在しない座席が選択された');
  });

  it('配車画面を離れると選択が解除される', () => {
    const api = setup();
    api.tapCard('a1', 'g_p3', '父兄A1');
    api.showScreen('settings');
    eq(api.TAP.kind, null, '画面を離れても選択が残っている');
    check(!api.document.getElementById('tap-bar').classList.contains('visible'), '案内バーが出たまま');
  });
});

/* ============================================================
   並び替え
   ============================================================ */
describe('車の並び替え', () => {
  const setup = () => boot({
    settings: F.settings(),
    session: F.session({ vehicles: [
      F.vehicle('チームトラック', 2), F.vehicle('父兄号', 5), F.vehicle('軽トラ', 2)
    ] })
  });

  it('通常時は上下ボタンが出ない', () => {
    eq(setup().document.querySelectorAll('.reorder-btn').length, 0, '通常時にボタンが出ている');
  });

  it('並び替えモードで全ての車に上下ボタンが出る', () => {
    const api = setup();
    api.setReorderMode(true);
    const ups = [...api.document.querySelectorAll('.reorder-btn')].filter(b => b.textContent.includes('上へ'));
    eq(ups.length, 3, 'ボタンの数が合わない');
    check(ups[0].disabled, '先頭の車の「上へ」が押せてしまう');
  });

  it('上下ボタンで順番が入れ替わる', () => {
    const api = setup();
    api.setReorderMode(true);
    api.moveVehicle(1, -1);
    eq(api.SS.vehicles[0].typeName, '父兄号', '順番が入れ替わっていない');
  });

  it('入れ替えた順番が再描画で元に戻らない', () => {
    const api = setup();
    api.moveVehicle(1, -1);
    api.renderAll();
    eq(api.SS.vehicles[0].typeName, '父兄号', '再描画で並びが戻ってしまった');
  });

  it('並び替えモード中はタップ配置ができない', () => {
    const api = setup();
    api.setReorderMode(true);
    const card = [...api.document.querySelectorAll('.person-card')].find(c => c.dataset.pid === 'a1');
    check(!card.onclick, '並び替え中でもカードが押せてしまう');
  });

  it('配車順設定は車種の順に並べ直す', () => {
    const api = setup();
    api.moveVehicle(1, -1);            // 父兄号を先頭へ
    api.sortVehiclesByType();          // 設定の車種順に戻す
    eq(api.SS.vehicles[0].typeName, 'チームトラック', '車種順に並び直されていない');
  });
});

/* ============================================================
   バックアップ
   ============================================================ */
describe('データの保存・復元', () => {
  const filled = () => boot({
    settings: F.settings(),
    session: F.session({ vehicles: [Object.assign(F.vehicle('チームトラック', 2), {
      slots: [F.seat('a1', '父兄A1'), null] })] })
  });

  it('書き出したデータに設定と配車内容が入る', () => {
    const data = JSON.parse(filled().backupJson());
    eq(data.app, 'haisha', '目印が違う');
    eq(data.version, 1, 'バージョンが違う');
    check(!!data.savedAt, '作成日時が無い');
    eq(data.settings.groups.length, 4, 'グループが欠けている');
    eq(data.session.vehicles[0].slots[0].personId, 'a1', '配車内容が入っていない');
  });

  it('別の端末に復元すると設定も配車も戻る', async () => {
    const json = filled().backupJson();
    const fresh = boot({});                       // まっさらな状態
    fresh.autoConfirm();
    await fresh.applyBackupText(json);
    eq(fresh.S.groups.length, 4, 'グループが復元されていない');
    eq(fresh.SS.vehicles.length, 1, '車が復元されていない');
    eq(fresh.SS.vehicles[0].slots[0].personId, 'a1', '乗車内容が復元されていない');
    eq(fresh.SS.title, 'テスト大会', 'タイトルが復元されていない');
  });

  it('他アプリのデータは復元しない', async () => {
    const api = boot({});
    const last = api.captureDialog();
    await api.applyBackupText('{"app":"other","settings":{"groups":[]}}');
    check(String(last()).includes('バックアップではない'), '取り違えを弾いていない');
  });

  it('壊れた文字は復元しない', async () => {
    const api = boot({});
    const last = api.captureDialog();
    await api.applyBackupText('こわれた文字');
    check(String(last()).includes('形式が正しくありません'), '壊れたデータを弾いていない');
  });
});

/* ============================================================
   テキスト出力
   ============================================================ */
describe('配車表のテキスト出力', () => {
  it('選手号の選手が学年ごとに出る', () => {
    const api = boot({
      settings: F.settings(),
      session: F.session({ vehicles: [Object.assign(F.vehicle('選手号', 5), {
        slots: [
          F.seat('a1', '父兄A1'),
          { personId: '__ov_1', name: '3年選手①', grade: '3年', groupId: '' },
          { personId: '__ov_2', name: '3年選手②', grade: '3年', groupId: '' },
          null, null
        ] })] })
    });
    const text = api.genText();
    check(text.includes('3年選手2人'), '学年ごとの人数が出ていない\n      ' + JSON.stringify(text));
    check(text.includes('父兄A1'), '運転手が出ていない');
  });
});

/* ============================================================
   スマホでの使い勝手（見た目の決まりごと）
   ============================================================ */
describe('スマホでの使い勝手', () => {
  it('画面の拡大を禁止していない', () => {
    const api = boot({});
    const vp = api.document.querySelector('meta[name="viewport"]').content;
    check(!/user-scalable\s*=\s*no/.test(vp), '拡大が禁止されている: ' + vp);
    check(!/maximum-scale/.test(vp), '拡大の上限が設定されている: ' + vp);
  });

  it('入力欄は16px以上（iOSの勝手な拡大を防ぐ）', () => {
    const m = style.match(/input,textarea,select\{[^}]*font-size:(\d+)px/);
    check(!!m, '入力欄の共通指定が見つからない');
    check(Number(m[1]) >= 16, '入力欄が ' + m[1] + 'px（16px未満）');
  });

  it('座席のタップ領域が44px以上ある', () => {
    const m = style.match(/\.vehicle-slot\{[^}]*min-height:(\d+)px/);
    check(!!m, '座席の高さ指定が見つからない');
    check(Number(m[1]) >= 44, '座席が ' + m[1] + 'px（44px未満）');
  });

  it('名前カードのタップ領域が44px以上ある', () => {
    const m = style.match(/\.person-card\{[^}]*min-height:(\d+)px/);
    check(!!m, '名前カードの高さ指定が見つからない');
    check(Number(m[1]) >= 44, '名前カードが ' + m[1] + 'px（44px未満）');
  });

  it('スクロールを妨げる touch-action:none を座席とカードに付けていない', () => {
    check(!/\.person-card\{[^}]*touch-action:none/.test(style), '名前カードでスクロールが止まる');
    check(!/\.vehicle-slot\.occupied\{[^}]*touch-action:none/.test(style), '座席でスクロールが止まる');
  });

  it('グループのタブは横スクロールできる', () => {
    const api = boot({});
    eq(api.document.getElementById('card-tabs').style.touchAction, 'pan-x', 'タブの横スクロールが止まる');
  });
});

run();
