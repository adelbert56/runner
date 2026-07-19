// trainer-copy.js
// Presentation formatters, labels, and user-facing copy helpers.
// Extracted from trainer.js (2026-07-19 refactor). Classic script; all
// top-level functions stay global. Loaded before trainer.js so init() can call them.

function trainingTypeLabel(type, focus = '') {
  return type === 'easy' && focus === 'recovery'
    ? TRAINING_TYPE_LABELS.recovery
    : TRAINING_TYPE_LABELS[type] || '訓練';
}

function trainingTaskTitle(day) {
  const title = String(day?.task || '').replace(/\bNaN(?:\.\d+)?\s*(?:km|公里)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
  const typeLabel = trainingTypeLabel(day?.type, day?.focus);
  if (!title || day?.coachPlan) return title || typeLabel;
  if (day.type === 'easy') {
    return title
      .replace(/^E\s*跑/i, typeLabel)
      .replace(/^有氧穩定跑/, `${typeLabel}（穩定有氧）`)
      .replace(/^輕鬆漸進跑/, `${typeLabel}（漸進）`);
  }
  if (day.type === 'tempo') return title.replace(/^T\s*跑/i, typeLabel);
  if (day.type === 'interval') return title.replace(/^I\s*跑/i, typeLabel);
  return title;
}

function formatSkipReason(reason) {
  if (!reason) return '';
  if (typeof reason === 'string') return reason;
  const label = SKIP_REASON_LABELS[reason.code] || SKIP_REASON_LABELS.other;
  return reason.noMakeupReason ? `${label}｜不補跑：${reason.noMakeupReason}` : label;
}

function secToPace(sec) {
  if (!sec || sec <= 0) return '—';
  const rounded = Math.round(sec);
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function secToTime(sec) {
  if (!sec || sec <= 0) return '0:00:00';
  const rounded = Math.round(sec);
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function reviewEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function coachScheduleLabel() {
  const sync = appData.profile?.coachSync || {};
  return sync.frequency === 'weekly'
    ? `每週${DOW_NAMES[sync.day] || '日'} ${sync.time || '20:30'} 檢查`
    : sync.frequency === 'manual'
    ? '只在手動更新時檢查'
    : `每天 ${sync.time || '20:30'} 檢查`;
}

function paceToSeconds(pace) {
  const match = String(pace || '').match(/^(\d+):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function formatPaceSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}/km`;
}

function weekStartLabel(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function sessionIntensityLabel(intensity, index, isIntervalBlock = false) {
  const normalized = String(intensity || '').toUpperCase();
  if (isIntervalBlock && normalized === 'ACTIVE') return '間歇快段';
  if (isIntervalBlock && normalized === 'RECOVERY') return '間歇恢復';
  const labels = { WARMUP: '熱身', MAIN: '主課', ACTIVE: '活動段', INTERVAL: '間歇', RECOVERY: '恢復', COOLDOWN: '收操', REST: '休息' };
  return labels[normalized] || `計圈 ${index || ''}`.trim();
}

function sessionLapLabel(lap, index, hasStructuredMain, isIntervalBlock = false) {
  // Garmin 會把手動／自動計圈都標成 INTERVAL；沒有明確的課程結構時，
  // 不應把那個原始欄位解讀成正式課表的「間歇」。
  return hasStructuredMain ? sessionIntensityLabel(lap?.intensity, index, isIntervalBlock) : `計圈 ${index}`;
}

function sessionIntensityClass(intensity) {
  const value = String(intensity || '').toUpperCase();
  if (['MAIN', 'ACTIVE', 'INTERVAL'].includes(value)) return 'main';
  if (['RECOVERY', 'REST'].includes(value)) return 'recovery';
  return 'neutral';
}

function formatSessionDuration(minutes) {
  const seconds = Math.max(0, Math.round((Number(minutes) || 0) * 60));
  return seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '—';
}

function garminFeelLabel(value) {
  return ({ 1: '非常差', 2: '差', 3: '偏差', 4: '尚可', 5: '普通', 6: '不錯', 7: '很好', 8: '極佳' })[Number(value)] || '—';
}

function coachPhaseEmoji(label) {
  if (!label) return '📍';
  if (label.includes('重建')) return '🏗️';
  if (label.includes('降載')) return '🌿';
  if (label.includes('減量')) return '⬇️';
  if (label.includes('基礎')) return '🔥';
  if (label.includes('能力')) return '💪';
  if (label.includes('專項')) return '🎯';
  return '📍';
}

function paceToMinutes(pace) {
  const match = String(pace || '').match(/^(\d+):(\d{2})$/);
  if (!match) return 0;
  return Number(match[1]) + Number(match[2]) / 60;
}

// 教練筆記完整處方只留在主課；卡片開頭只呈現方向與目的，避免重複。
function coachPlanHeadline(planText) {
  const text = String(planText || '').trim();
  if (!text) return '依主課完成今天訓練';

  const purposeMatch = text.match(/(?:目的|重點)\s*[：:]\s*([^。；;]+)/);
  const purpose = purposeMatch?.[1]?.trim();
  const direction = /(?:^|\s)E\s*跑|輕鬆跑|有氧/.test(text)
    ? TRAINING_TYPE_LABELS.easy
    : /(?:^|\s)T\s*跑|節奏跑|閾值/.test(text)
      ? TRAINING_TYPE_LABELS.tempo
      : /(?:^|\s)I\s*跑|間歇|快段/.test(text)
        ? TRAINING_TYPE_LABELS.interval
        : /長跑|耐力跑/.test(text)
          ? TRAINING_TYPE_LABELS.long
          : '今日訓練';
  return purpose ? `${direction}｜${purpose}` : direction;
}

function icsEscape(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsDate(dateStr) {
  return String(dateStr || '').replace(/-/g, '');
}

function nextIcsDate(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return icsDate(localDateStr(date));
}

function garminSyncFailureGuidance(message) {
  const detail = String(message || '同步器沒有回傳可用結果');
  const needsAuth = /(token|login|log in|登入|授權|authentication|credential|social profile)/i.test(detail);
  if (needsAuth) {
    return {
      title: 'Garmin 授權需要更新',
      body: 'Runner 已辨識為 Garmin 登入／token 問題，沒有建立任何不完整課程。請先在 Garmin Connect 完成登入，再雙擊專案根目錄的「更新 Runner Garmin 授權.cmd」；完成後回來按一次同步即可。'
    };
  }
  return {
    title: 'Garmin 同步未完成',
    body: 'Runner 沒有把這次狀態誤判為完成；請確認本機同步器仍在執行，再重試一次。既有 Garmin 課程不會因這次失敗被刪除。'
  };
}

function formatAssessmentType(type) {
  return ASSESSMENT_TYPE_LABEL[type] || type;
}

// ============================================================
// LOG VIEW
// ============================================================
function trainingEventLabel(event) {
  const labels = {
    completed: '手動完成',
    skipped: '跳過課表',
    makeup_scheduled: '已安排補跑',
    makeup_auto_credited: 'Garmin 認列補跑',
    skip_reverted: '撤銷跳過',
    skip_reason_updated: '更新跳過原因',
    garmin_completion_rule_updated: '更新 Garmin 完成門檻'
  };
  const date = event.targetDate || event.date || event.sourceDate || '—';
  return `${date} · ${labels[event.type] || event.type}${event.detail ? `｜${event.detail}` : ''}`;
}
