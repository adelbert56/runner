// Local-only export and guarded restore for the public site's three collections.
(() => {
  const keys = [FAVORITES_KEY, REGISTERED_RACES_KEY, CONTENT_FAVORITES_KEY];
  const names = ['favorites', 'registeredRaces', 'contentFavorites'];
  const snapshotKey = `runner-plaza:${DEVICE_ID}:collections-pre-restore:v1`;
  const maxBytes = 1024 * 1024;
  const limit = 10000;

  function readValues(storage) {
    return keys.map((key, index) => {
      let raw = storage.getItem(key);
      if (index === 0 && raw === null) raw = storage.getItem(LEGACY_FAVORITES_KEY);
      const data = JSON.parse(raw ?? '[]');
      if (!Array.isArray(data) || data.length > limit || data.some(item => typeof item !== 'string' || item.length > 2048)) throw new Error('invalid-current-data');
      return data;
    });
  }
  function rawValues(storage) { return [...keys, LEGACY_FAVORITES_KEY].map(key => storage.getItem(key)); }
  function createBackup(storage) {
    const arrays = readValues(storage);
    return { app: 'Runner Plaza Collections', version: 1, exportedAt: new Date().toISOString(), data: Object.fromEntries(names.map((name, i) => [name, arrays[i]])) };
  }
  function parseBackup(text) {
    if (new Blob([text]).size > maxBytes) throw new Error('file-too-large');
    const value = JSON.parse(text);
    if (value?.app !== 'Runner Plaza Collections' || value.version !== 1 || !value.data || typeof value.data !== 'object') throw new Error('invalid-backup');
    const arrays = names.map(name => value.data[name]);
    if (arrays.some(data => !Array.isArray(data) || data.length > limit || data.some(item => typeof item !== 'string' || item.length > 2048))) throw new Error('invalid-backup');
    return arrays;
  }
  function restore(storage, arrays, expected) {
    if (JSON.stringify(rawValues(storage)) !== JSON.stringify(expected)) throw new Error('concurrent-change');
    const snapshot = JSON.stringify({ savedAt: new Date().toISOString(), raw: expected });
    storage.setItem(snapshotKey, snapshot);
    if (storage.getItem(snapshotKey) !== snapshot) throw new Error('snapshot-failed');
    if (JSON.stringify(rawValues(storage)) !== JSON.stringify(expected)) throw new Error('concurrent-change');
    try {
      keys.forEach((key, index) => storage.setItem(key, JSON.stringify(arrays[index])));
      if (keys.some((key, index) => storage.getItem(key) !== JSON.stringify(arrays[index]))) throw new Error('write-verification-failed');
    } catch (error) {
      let rolledBack = true;
      keys.forEach((key, index) => {
        try { if (expected[index] === null) storage.removeItem(key); else storage.setItem(key, expected[index]); }
        catch { rolledBack = false; }
      });
      try { if (keys.some((key, index) => storage.getItem(key) !== expected[index])) rolledBack = false; }
      catch { rolledBack = false; }
      throw new Error(rolledBack ? 'restore-failed' : 'rollback-failed', { cause: error });
    }
  }
  function openManager() {
    try {
      const data = readValues(localStorage);
      const dialog = document.createElement('dialog');
      dialog.className = 'collections-backup-dialog';
      dialog.setAttribute('aria-labelledby', 'collections-backup-title');
      dialog.innerHTML = `<h2 id="collections-backup-title">資料與備份</h2><p class="collections-backup-summary"></p><p>匯出檔案可另存至安全的位置；還原會取代目前的收藏與報名資料。</p><p class="collections-backup-status" role="status" aria-live="polite"></p><div class="collections-backup-actions"><button type="button" class="toggle-button" data-export>匯出備份</button><button type="button" class="toggle-button" data-import>選擇備份並預覽</button><button type="button" class="toggle-button" data-close>取消</button></div><input type="file" accept=".json,application/json" hidden>`;
      const summary = dialog.querySelector('.collections-backup-summary');
      const status = dialog.querySelector('.collections-backup-status');
      const exportButton = dialog.querySelector('[data-export]');
      const importButton = dialog.querySelector('[data-import]');
      const input = dialog.querySelector('input');
      summary.textContent = `目前收藏賽事 ${data[0].length} 場、已報名 ${data[1].length} 場、文章收藏 ${data[2].length} 篇。`;
      document.body.appendChild(dialog);
      dialog.addEventListener('close', () => dialog.remove(), { once: true });
      dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
      exportButton.addEventListener('click', () => {
        try {
        const blob = new Blob([JSON.stringify(createBackup(localStorage), null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url; link.download = `runner-collections-${new Date().toISOString().slice(0, 10)}.json`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = '已開始下載備份檔。';
        } catch { status.textContent = '無法匯出資料，請確認瀏覽器儲存空間可用。'; }
      });
      importButton.addEventListener('click', () => input.click());
      input.addEventListener('change', async () => {
          const file = input.files?.[0]; if (!file) return;
          importButton.disabled = true; exportButton.disabled = true;
          status.textContent = '正在讀取備份…';
          try {
            if (file.size > maxBytes) throw new Error('file-too-large');
            const arrays = parseBackup(await file.text());
            if (!dialog.open) return;
            const expected = rawValues(localStorage);
            const current = readValues(localStorage);
            if (!window.confirm(`還原前預覽\n收藏賽事：目前 ${current[0].length}／備份 ${arrays[0].length}\n已報名：目前 ${current[1].length}／備份 ${arrays[1].length}\n文章收藏：目前 ${current[2].length}／備份 ${arrays[2].length}\n\n確認後取代目前資料，系統先保存匯入前快照。`)) { status.textContent = '已取消還原，資料未變更。'; return; }
            restore(localStorage, arrays, expected);
            window.alert('資料已還原，頁面即將重新載入。'); window.location.reload();
          } catch (error) {
            const message = error.message === 'rollback-failed' ? '還原未完成，部分資料可能未復原；匯入前快照仍保存在此瀏覽器，請勿清除瀏覽器資料。' : '無法安全還原；檔案可能無效、資料已變動或儲存空間不足。請保留目前資料並重試。';
            status.textContent = message;
          } finally {
            importButton.disabled = false; exportButton.disabled = false; input.value = '';
          }
        });
      dialog.showModal();
    } catch { window.alert('無法讀取或匯出目前資料。請確認瀏覽器儲存空間可用。'); }
  }
  window.RunnerFavoritesBackup = { createBackup, parseBackup, restore, rawValues };
  document.getElementById('favorites-backup-open')?.addEventListener('click', openManager);
})();
