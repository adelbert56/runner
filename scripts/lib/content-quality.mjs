// Match explicit commercial language in the original headline, not generated summaries.
const PROMOTION_TITLE = /\b(?:\d+(?:\.\d+)?\s*%\s*off|save\s+\$\s*\d+|price drop|discount|on sale|deal)\b|特價|優惠|折扣/i;
const STANDING_TITLE = /久站|久立|standing (?:all day|shoes?)/i;
const RUNNING_TITLE = /跑步|跑鞋|路跑|慢跑|馬拉松|跑者|running|runner|marathon/i;
const BASKETBALL_MODEL_TITLE = /\bNike\s+Ja\s*4\b/i;

export function contentTitleIssue(item) {
  const title = String(item.title || '');
  if (BASKETBALL_MODEL_TITLE.test(title)) return '籃球鞋款不屬於跑步內容';
  if (item.type === 'shoe' && PROMOTION_TITLE.test(title)) return '跑鞋卡為促銷文章';
  if (item.type === 'news' && STANDING_TITLE.test(title) && !RUNNING_TITLE.test(title)) return '新聞標題缺少跑步脈絡';
  return '';
}
