// Data boundary: local backup, restore preview, and recovery snapshots.
// Loaded after trainer.js because it works with the established app state and UI helpers.
(() => {
  let pendingImport = null;
  let pendingImportInfo = null;

  function counts(data) {
    const normalized = normalizeData(data);
    return { weeks: normalized.plan.length, days: normalized.plan.flatMap((week) => week.days || []).length, logs: normalized.log.length, checkins: normalized.checkins.length, cycles: normalized.cycleHistory.length };
  }

  function backupAgeMessage(value = appData.lastBackupAt) {
    if (!value) return '尚未建立備份，建議現在先匯出一份。';
    const ageDays = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
    return ageDays >= 14 ? `上次備份已 ${ageDays} 天，建議先建立新備份。` : ageDays ? `上次備份為 ${ageDays} 天前。` : '今天已建立備份。';
  }

  function exportData() {
    const backup = { app: 'Runner Training Handbook', schemaVersion: PLAN_SCHEMA_VERSION, exportedAt: new Date().toISOString(), backupFormatVersion: 1, data: normalizeData(appData) };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `runner-training-backup-${todayStr()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    appData.lastBackupAt = backup.exportedAt;
    saveData(appData);
    closeModal();
  }

  function requestImport() { document.getElementById('training-data-import')?.click(); }

  function importData(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        const rawData = parsed?.data || parsed;
        if (!rawData || typeof rawData !== 'object' || !Array.isArray(rawData.plan) || !Array.isArray(rawData.log)) throw new Error('invalid backup');
        pendingImport = normalizeData(rawData);
        pendingImportInfo = { fileName: file.name, exportedAt: parsed?.exportedAt || '' };
        const incoming = counts(pendingImport);
        const current = counts(appData);
        const backupDate = pendingImportInfo.exportedAt ? new Date(pendingImportInfo.exportedAt).toLocaleString('zh-TW', { hour12: false }) : '未標示建立時間';
        showModal('還原訓練資料', `<p style="margin:0 0 10px;line-height:1.65">備份檔：<b>${reviewEscape(file.name)}</b>（${reviewEscape(backupDate)}）</p><div class="coach-setting-card"><div class="coach-setting-value">匯入前預覽</div><div class="coach-fineprint">備份：${incoming.weeks} 週／${incoming.days} 天安排／${incoming.logs} 筆紀錄／${incoming.checkins} 次週評估／${incoming.cycles} 份週期歷史<br>目前：${current.weeks} 週／${current.days} 天安排／${current.logs} 筆紀錄／${current.checkins} 次週評估／${current.cycles} 份週期歷史</div></div><p style="margin:10px 0 0;color:var(--c-orange);font-size:13px;line-height:1.6">確認後會取代目前資料；系統會在本機保留一份「匯入前快照」，可立即復原。</p>`, [
          { label: '確認還原', primary: true, action: applyImport },
          { label: '取消', action: () => { pendingImport = null; pendingImportInfo = null; closeModal(); } }
        ]);
      } catch {
        showModal('無法讀取備份', '<p style="margin:0;color:var(--c-text-muted);line-height:1.65">請選擇由 Runner 訓練計畫匯出的 JSON 備份檔。</p>', [{ label: '知道了', primary: true, action: closeModal }]);
      } finally { event.target.value = ''; }
    };
    reader.readAsText(file, 'utf-8');
  }

  function applyImport() {
    if (!pendingImport) return;
    try { localStorage.setItem(PRE_RESTORE_STORAGE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: normalizeData(appData) })); } catch (error) { console.warn('training pre-restore snapshot unavailable', error); }
    appData = pendingImport;
    pendingImport = null;
    pendingImportInfo = null;
    saveData(appData);
    closeModal();
    renderPlanView();
    showView('plan');
  }

  function restorePreImportSnapshot() {
    try {
      const snapshot = JSON.parse(localStorage.getItem(PRE_RESTORE_STORAGE_KEY) || 'null');
      if (!snapshot?.data) throw new Error('missing snapshot');
      appData = normalizeData(snapshot.data);
      saveData(appData);
      closeModal();
      renderPlanView();
      showView('plan');
    } catch {
      showModal('找不到匯入前快照', '<p style="margin:0;line-height:1.7">目前沒有可用的匯入前快照；請改用你匯出的 JSON 備份還原。</p>', [{ label: '知道了', primary: true, action: closeModal }]);
    }
  }

  function confirmRestorePreImportSnapshot() {
    showModal('復原匯入前資料？', '<p style="margin:0;line-height:1.7">這會以最近一次匯入前的本機快照取代目前資料。若目前已有新紀錄，請先匯出備份再繼續。</p>', [
      { label: '確認復原', primary: true, action: restorePreImportSnapshot },
      { label: '取消', action: closeModal }
    ]);
  }

  window.TrainerData = { counts, backupAgeMessage, exportData, requestImport, importData, applyImport, restorePreImportSnapshot, confirmRestorePreImportSnapshot };
})();
