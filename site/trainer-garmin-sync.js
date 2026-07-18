// Garmin sync boundary: local-only activity refresh controls and polling.
const GARMIN_ACTIVITY_SYNC_API = '/api/garmin-activity-sync';
let garminActivitySyncPollId = null;

function formatGarminActivitySyncTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-TW', { hour12: false, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatGarminActivitySyncMessage(message) {
  const value = String(message || '');
  if (value === 'Garmin activities and encrypted training review synced.') return 'Garmin 活動與教練建議已更新';
  if (value === 'Garmin activities synced; encrypted review publish was skipped.') return 'Garmin 活動已更新（略過教練建議重建）';
  return value || '可隨時手動拉取最新活動紀錄';
}

function setGarminActivitySyncControl(status = {}) {
  const button = document.getElementById('garmin-activity-sync-button');
  const label = document.getElementById('garmin-activity-sync-status');
  if (!button || !label) return;
  const running = Boolean(status.running) || status.status === 'running';
  const time = formatGarminActivitySyncTime(status.updatedAt);
  button.disabled = running;
  button.textContent = running ? '⌚ 讀取中…' : '⌚ 讀取 Garmin 實跑';
  label.dataset.status = status.status || 'idle';
  label.textContent = `${formatGarminActivitySyncMessage(status.message)}${time ? ` · ${time}` : ''}`;
}

function stopGarminActivitySyncPolling() {
  if (!garminActivitySyncPollId) return;
  window.clearInterval(garminActivitySyncPollId);
  garminActivitySyncPollId = null;
}

async function loadGarminActivitySyncStatus({ refreshCoach = false } = {}) {
  if (!['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) return;
  try {
    const response = await fetch(GARMIN_ACTIVITY_SYNC_API, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const status = await response.json();
    setGarminActivitySyncControl(status);
    if (status.running || status.status === 'running') {
      if (!garminActivitySyncPollId) garminActivitySyncPollId = window.setInterval(() => loadGarminActivitySyncStatus({ refreshCoach: true }), 2500);
      return;
    }
    stopGarminActivitySyncPolling();
    if (refreshCoach && status.status === 'ok') window.loadCoachReview?.();
  } catch (error) {
    stopGarminActivitySyncPolling();
    setGarminActivitySyncControl({ status: 'error', message: '無法讀取 Garmin 同步狀態，請確認本機 Runner 服務仍在執行。' });
    console.warn('garmin-activity-sync: status unavailable', error);
  }
}

async function startGarminActivitySync() {
  const button = document.getElementById('garmin-activity-sync-button');
  if (!button || button.disabled) return;
  button.disabled = true;
  setGarminActivitySyncControl({ status: 'running', running: true, message: '正在啟動 Garmin 活動同步…' });
  try {
    const response = await fetch(GARMIN_ACTIVITY_SYNC_API, { method: 'POST' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || '無法啟動 Garmin 同步');
    setGarminActivitySyncControl({ status: 'running', running: true, message: payload.message || 'Garmin 活動同步已啟動' });
    if (!garminActivitySyncPollId) garminActivitySyncPollId = window.setInterval(() => loadGarminActivitySyncStatus({ refreshCoach: true }), 2500);
  } catch (error) {
    setGarminActivitySyncControl({ status: 'error', message: error instanceof Error ? error.message : '無法啟動 Garmin 同步' });
  }
}
