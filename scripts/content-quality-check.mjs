import assert from 'node:assert/strict';
import { contentTitleIssue } from './lib/content-quality.mjs';

assert.ok(contentTitleIssue({ type: 'shoe', title: 'Running shoes are over 30% off right now' }));
assert.ok(contentTitleIssue({ type: 'shoe', title: '跑鞋限時優惠' }));
assert.ok(contentTitleIssue({ type: 'news', title: '久站鞋不是越软越舒服？专家教挑选秘诀', summary: '跑步新聞' }));
assert.ok(contentTitleIssue({ type: 'news', title: '上市速報 / Nike Ja 4 EP 臺灣販售資訊整理', summary: '跑鞋' }));
assert.equal(contentTitleIssue({ type: 'shoe', title: 'Mizuno Wave Rider 30 Review' }), '');
assert.equal(contentTitleIssue({ type: 'news', title: '久站後跑步應該注意什麼' }), '');
assert.equal(contentTitleIssue({ type: 'news', title: '馬拉松選手分享訓練心得' }), '');
console.log('PASS promotional shoe and non-running standing shoe titles rejected; running content retained');
