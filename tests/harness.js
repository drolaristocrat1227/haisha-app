/*
 * テスト用のヘルパー。
 *
 * このアプリは index.html 1枚に HTML/CSS/JS が全部入っているため、
 * jsdom で本物の index.html を読み込んで、中の関数をそのまま呼んで検証する。
 * アプリ側にテスト用のコードを足さなくて済むよう、読み込み方をここに閉じ込めてある。
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const APP_PATH = path.join(__dirname, '..', 'index.html');
const html = fs.readFileSync(APP_PATH, 'utf8');

const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];

// アプリ内部の関数・変数のうち、テストから触りたいもの
const EXPOSED = [
  'tapCard', 'tapSlot', 'clearTapSel',
  'setReorderMode', 'moveVehicle', 'sortVehiclesByType',
  'runAutoAssign', 'lockedAttendeeIds', 'openAttendance', 'renderAttList',
  'backupJson', 'applyBackupText',
  'renderAll', 'showScreen', 'genText', 'driverCapOk'
];

/**
 * index.html を jsdom で起動して、内部APIを返す。
 * @param {object} opts.settings  localStorage の haisha_settings に入れる値
 * @param {object} opts.session   localStorage の haisha_session に入れる値
 * @returns {object} api  ... SS / S / TAP / reorderMode のゲッタと、EXPOSED の関数
 *                        api.window で window、api.document で document に触れる
 */
function boot(opts) {
  opts = opts || {};
  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://example.com/'
  });
  const w = dom.window;

  // jsdom が持っていないブラウザAPIを補う
  w.Element.prototype.setPointerCapture = function () {};
  w.Element.prototype.releasePointerCapture = function () {};
  w.URL.createObjectURL = () => 'blob:test';
  w.URL.revokeObjectURL = () => {};

  if (opts.settings) w.localStorage.setItem('haisha_settings', JSON.stringify(opts.settings));
  if (opts.session) w.localStorage.setItem('haisha_session', JSON.stringify(opts.session));

  // 'use strict' のままだと eval 内の関数宣言が外から見えないので外す。
  // let/const も同様に外から参照できないため、末尾でまとめて公開する。
  const exposeSrc = 'window.__api = {' +
    'get SS(){return SS;}, get S(){return S;}, get TAP(){return TAP;},' +
    'get reorderMode(){return reorderMode;},' +
    EXPOSED.join(',') +
    '};';
  w.eval(script.replace("'use strict';", '') + ';' + exposeSrc);

  const api = w.__api;
  api.window = w;
  api.document = w.document;
  /** 確認ダイアログを常に「はい」にする（復元など確認を挟む処理のテスト用） */
  api.autoConfirm = () => { w.dialog = () => Promise.resolve(true); };
  /** 直近にダイアログへ渡されたメッセージを記録する */
  api.captureDialog = () => {
    w.__lastDialog = null;
    w.dialog = m => { w.__lastDialog = m; return Promise.resolve(true); };
    return () => w.__lastDialog;
  };
  /** 車ごとの乗車状況を「車種:[名前,名前]」の形で返す（失敗時の目視用） */
  api.dump = () => api.SS.vehicles
    .map(v => v.typeName + ':[' + v.slots.map(s => (s ? s.name : '－')).join(',') + ']')
    .join('  ');
  return api;
}

module.exports = { boot, html, script, style, APP_PATH };
