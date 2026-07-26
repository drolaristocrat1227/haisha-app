/* テストで使う設定・セッションの雛形 */

/** car を渡すとその定員の車を持っている人になる */
function person(id, name, car) {
  return car ? { id, name, car: { capacity: car } } : { id, name };
}

/**
 * 標準的なチーム構成
 *  現場スタッフ2名 / 3年父兄6名(うち3名が車あり) / 2年父兄4名(うち1名が車あり)
 */
function settings() {
  return {
    groups: [
      { id: 'g_player', name: '選手', people: [], isPlayer: true },
      { id: 'g_staff', name: '現場', people: [person('s1', 'スタッフA'), person('s2', 'スタッフB')] },
      { id: 'g_p3', name: '3年', people: [
        person('a1', '父兄A1', 5), person('a2', '父兄A2', 7), person('a3', '父兄A3', 4),
        person('a4', '父兄A4'), person('a5', '父兄A5'), person('a6', '父兄A6')
      ] },
      { id: 'g_p2', name: '2年', people: [
        person('b1', '父兄B1', 8), person('b2', '父兄B2'), person('b3', '父兄B3'), person('b4', '父兄B4')
      ] }
    ],
    tabOrder: ['g_player', 'g_staff', 'g_p3', 'g_p2'],
    driverPriority: {},
    managerList: [],
    vehicleOrder: ['チームトラック', '軽トラ', 'チームバス', '選手号', '道具車', '父兄号', 'フロント号', '審判支援号']
  };
}

const ALL_ADULTS = ['s1', 's2', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'b1', 'b2', 'b3', 'b4'];
const ALL_PARENTS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'b1', 'b2', 'b3', 'b4'];

function session(over) {
  return Object.assign({
    vehicles: [],
    counts: { y3: '', y2: '', y1: '' },
    playerSeats: '',
    attending: [],
    activeTab: 'g_p3',
    title: 'テスト大会'
  }, over || {});
}

/** 空の車をつくる */
function vehicle(typeName, capacity, id) {
  return { id: id || ('v_' + typeName + '_' + capacity), typeName, capacity, slots: Array(capacity).fill(null) };
}

/** 座席に座った状態の人 */
function seat(id, name, groupId) {
  return { personId: id, name, groupId: groupId || 'g_p3' };
}

module.exports = { person, settings, session, vehicle, seat, ALL_ADULTS, ALL_PARENTS };
