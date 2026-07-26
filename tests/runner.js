/* 小さなテストランナー（外部フレームワーク不要） */
const groups = [];
let current = null;
let passed = 0;
const failures = [];

function describe(title, fn) {
  current = { title, cases: [] };
  groups.push(current);
  fn();
  current = null;
}

/** 同期でも Promise を返してもよい */
function it(title, fn) {
  if (!current) throw new Error('it() は describe() の中で使ってください');
  current.cases.push({ title, fn });
}

function check(cond, message) {
  if (!cond) throw new Error(message || '条件を満たしませんでした');
}

function eq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || '値が一致しません') +
      '\n      期待: ' + JSON.stringify(expected) +
      '\n      実際: ' + JSON.stringify(actual));
  }
}

async function run() {
  const started = Date.now();
  for (const g of groups) {
    console.log('\n' + g.title);
    for (const c of g.cases) {
      try {
        await c.fn();
        passed++;
        console.log('  ✓ ' + c.title);
      } catch (e) {
        failures.push({ group: g.title, title: c.title, error: e });
        console.log('  ✗ ' + c.title);
        console.log('      ' + String(e.message).split('\n').join('\n      '));
      }
    }
  }
  const sec = ((Date.now() - started) / 1000).toFixed(1);
  console.log('\n' + '='.repeat(46));
  if (failures.length === 0) {
    console.log('✓ ' + passed + ' 件すべて成功 (' + sec + '秒)');
  } else {
    console.log('✗ ' + failures.length + ' 件失敗 / ' + (passed + failures.length) + ' 件中 (' + sec + '秒)');
    failures.forEach(f => console.log('  - ' + f.group + ' > ' + f.title));
  }
  process.exit(failures.length === 0 ? 0 : 1);
}

module.exports = { describe, it, check, eq, run };
