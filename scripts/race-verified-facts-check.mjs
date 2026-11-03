import { mkdtemp, mkdir, copyFile, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const outputRoot = join(root, 'output');
await mkdir(outputRoot, { recursive: true });
const isolated = await mkdtemp(join(outputRoot, 'race-facts-check-'));
try {
  for (const dir of ['scripts', 'runner/賽事', 'site/data']) await mkdir(join(isolated, dir), { recursive: true });
  const files = ['scripts/apply-manual-overrides.mjs', 'runner/賽事/人工補充.json', 'runner/賽事/賽事資料庫.json', 'site/data/races.json'];
  try { await stat(join(root, 'runner/賽事/人工補充.xlsx')); files.push('runner/賽事/人工補充.xlsx'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  for (const file of files) await copyFile(join(root, file), join(isolated, file));
  const run = spawnSync(process.execPath, [join(isolated, 'scripts/apply-manual-overrides.mjs')], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  for (const path of ['runner/賽事/賽事資料庫.json', 'site/data/races.json']) {
    const races = JSON.parse(await readFile(join(isolated, path), 'utf8'));
    const pick = name => { const found = races.filter(x => x.race_name === name && x.race_date === '2026-11-08'); assert.equal(found.length, 1); return found[0]; };
    const tianzhong = pick('2026 台灣米倉田中馬拉松');
    assert.ok(tianzhong.start_times.includes('4.6K） 起跑 07:05'));
    assert.ok(tianzhong.quota.includes('21.2K 6000人'));
    assert.ok(!tianzhong.quota.includes('22.6K'));
    assert.ok(tianzhong.fees.includes('9.7K 1450元') && tianzhong.fees.includes('4.6K 550元'));
    assert.equal(pick('2026 臺中舒跑杯').quota, '9K 12000人、5K 8000人、3K 10000人');
    assert.equal(pick('2026 臺中舒跑杯').official_event_url, 'https://supaucup.com.tw/info');
    const crufu = races.filter(x => x.race_name === '7th CRUFU RUN 夸父追日跨夜接力賽-西臺灣站' && x.race_date === '2026-09-19');
    assert.equal(crufu.length, 1); assert.equal(crufu[0].quota, '總名額 3,318人'); assert.equal(crufu[0].registration_status, '已截止');
    const tongxiao = races.filter(x => x.race_name === '2026 通霄粉紅超跑馬拉松' && x.race_date === '2026-12-13');
    assert.equal(tongxiao.length, 1); assert.deepEqual(tongxiao[0].distances, ['42.195km', '22.5km', '12km', '4.5km']);
    assert.equal(tongxiao[0].start_times['22.5km'], '06:40'); assert.match(tongxiao[0].verification_note, /23K/);
    const findRace = name => { const found = races.filter(x => x.race_name === name); assert.equal(found.length, 1); return found[0]; };
    assert.equal(findRace('*2026 愛在幼安公益路跑*').quota, '額滿為止；具體名額未公布');
    assert.match(findRace('2027 南投縣仁愛鄉原住民三鐵挑戰賽').fees, /男子接力 1600元/);
    assert.match(findRace('2026年FUN電多巴胺路跑嘉年華').quota, /是否共用名額待確認/);
    const zhushan = findRace('2026 濁水溪紫金馬拉松-花城竹山站');
    assert.equal(zhushan.registration_link, 'https://www.focusline.com.tw/261213HW');
    assert.equal(zhushan.registration_deadline, '2026-11-13'); assert.equal(zhushan.registration_status, '報名中');
    assert.match(zhushan.registration_note, /10\/31/);
    const bc = findRace('2027 第八屆BC台灣柏釧公益路跑');
    assert.equal(bc.race_date, '2027-04-10'); assert.equal(bc.race_county, '彰化縣');
    assert.equal(bc.registration_deadline, ''); assert.equal(bc.fees, ''); assert.equal(bc.source_registration_link, '');
    for (const [name, date, fees, quota] of [
      ['2026 第二屆核泰皮拉提斯馬拉松', '2026-12-05', '早鳥：挑戰組 1050元、全馬組 1000元、訓練組 950元、半馬組 800元、樂活組 600元、親子組 500元、接力組 2600元；其他方案請向官方確認', null],
      ['20261226鄉鎮之美公益馬拉松—臺中后里場', '2026-12-26', '早鳥：挑戰組 1050元、全馬組 1000元、訓練組 950元、半馬組 800元、樂活組 600元、親子組 500元；其他方案請向官方確認', null],
      ['2026 國際女孩日水水運動節', '2026-10-11', '21K 800元、10K 600元、3K 300元；前1000位報名女性免報名費', '21K 500人、10K 800人、3K 800人'],
      ['2026 日月潭環湖馬拉松', '2026-11-01', '紀念衣：42K 1800元、29K 1600元、6K 1300元；風衣：42K 2300元、29K 2100元、6K 1800元；超值組合：42K 2600元、29K 2400元、6K 2100元', '總名額6000人：42K 1000名、29K 4000名、6K 1000名。'],
      ['2026 海綿寶寶人生馬拉松-人生市場謎-臺中場', '2026-10-25', '3.5K 1580元', '3.5K 6000人'],
      ['<綠動員林・守護永續> 2026第17屆員林獅子盃親子公益路跑', '2026-10-25', '5K 350元', null],
      ['2026第九屆幸福龍井活力健康路跑健走', '2026-05-09', '9K 250元、3K 250元', '9K 600人、3K 600人'],
      ['2026 BOBDOG RUN(台中場)', '2026-05-16', '', ''],
      ['2026 KOF拳皇公益主題路跑', '2026-07-12', '', ''],
    ]) {
      const found = races.filter(x => x.race_name === name && x.race_date === date); assert.equal(found.length, 1);
      assert.equal(found[0].fees, fees); if (quota !== null) assert.equal(found[0].quota, quota);
    }
  }
  const app = await readFile(join(root, 'site/app.js'), 'utf8');
  function extract(name) {
    const start = app.indexOf(`function ${name}(`); assert.ok(start >= 0);
    const open = app.indexOf(') {', start) + 2; let depth = 0;
    for (let i = open; i < app.length; i++) { if (app[i] === '{') depth++; if (app[i] === '}' && --depth === 0) return app.slice(start, i + 1); }
    throw Error(`unclosed ${name}`);
  }
  const ctx = vm.createContext({});
  vm.runInContext(['escapeHtml', 'compactStandardRaceDistance', 'normalizedFactBulletItems', 'renderFactBulletList', 'feeMatrixItems', 'renderFactDataTable', 'isFeeNote', 'factGroupHeader', 'renderFees', 'renderQuota'].map(extract).join('\n'), ctx);
  const races = JSON.parse(await readFile(join(root, 'site/data/races.json'), 'utf8'));
  const tianzhong = races.find(x => x.race_name === '2026 台灣米倉田中馬拉松');
  const shupao = races.find(x => x.race_name === '2026 臺中舒跑杯');
  const feeHtml = ctx.renderFees(tianzhong.fees);
  const quotaHtml = ctx.renderQuota(shupao.quota);
  assert.match(feeHtml, /<table/); assert.match(feeHtml, /友善/); assert.match(feeHtml, /1450元/); assert.match(feeHtml, /550元/);
  assert.match(quotaHtml, /<table/); assert.match(quotaHtml, /12000人/); assert.match(quotaHtml, /10000人/);
  console.log('PASS official race facts survive manual JSON/XLSX overlay and render in fee/quota tables');
} finally {
  assert.equal(dirname(resolve(isolated)), outputRoot);
  assert.ok(basename(isolated).startsWith('race-facts-check-'));
  await rm(isolated, { recursive: true, force: true });
}
