// Encrypted, account-scoped training snapshots for cross-device use.
// The passphrase never leaves this browser and Supabase only receives ciphertext.
(() => {
  const SESSION_KEY = 'runner-trainer:sync-session:v1';
  const META_KEY = 'runner-trainer:sync-meta:v1';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  // 解鎖後只保留由同步密碼推導出的 AES 金鑰（不可匯出）；同步密碼本身不保存。
  let syncKey = null;
  const COACH_PASSPHRASE_KEY = 'coach-review:passphrase';
  const DEVICE_KEY_DB = 'runner-trainer-sync';
  const DEVICE_KEY_STORE = 'device-keys';
  let applyingRemote = false;
  let saveTimer = 0;
  let status = '尚未登入';

  function config() {
    const value = window.TRAINER_SYNC_CONFIG;
    return value?.url && value?.publishableKey ? value : null;
  }

  function setStatus(next) {
    status = next;
    document.querySelectorAll('[data-training-sync-status]').forEach((node) => { node.textContent = next; });
  }

  function renderControl() {
    return `<div class="training-sync-control">
      <button class="btn btn-secondary" type="button" onclick="openTrainingSyncModal()">☁️ 跨裝置同步</button>
      <span data-training-sync-status role="status" aria-live="polite">${status}</span>
    </div>`;
  }

  function readSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }

  function storeSession(session) {
    // 純本機快取；寫入失敗（私密瀏覽、容量滿）不該讓已成功的登入／同步被誤判為失敗，
    // 下次重新整理只是要重新登入，資料本身仍在雲端。
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
  }

  async function refreshSession() {
    const current = config();
    const session = readSession();
    if (!current || !session?.refresh_token) return null;
    const response = await fetch(`${current.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: current.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    if (!response.ok) {
      localStorage.removeItem(SESSION_KEY);
      syncKey = null;
      return null;
    }
    const nextSession = await response.json();
    storeSession(nextSession);
    return nextSession;
  }

  function sessionUserId(session) {
    try {
      const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(payload)).sub || '';
    } catch { return ''; }
  }

  function readMeta() {
    const userId = sessionUserId(readSession());
    if (!userId) return null;
    try { return JSON.parse(localStorage.getItem(`${META_KEY}:${userId}`) || 'null'); } catch { return null; }
  }

  function storeMeta(meta) {
    const userId = sessionUserId(readSession());
    if (!userId) return;
    // 這只是本機快取版本號；寫入失敗不代表剛才的雲端同步失敗，不能讓呼叫端把
    // 這裡的例外誤報成「同步暫時無法完成」。
    try { localStorage.setItem(`${META_KEY}:${userId}`, JSON.stringify(meta)); } catch {}
  }

  function bytesToBase64(bytes) {
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
  }

  function base64ToBytes(value) {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  }

  async function digest(value) {
    return bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
  }

  async function deriveKey(userId, secret) {
    const baseKey = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveKey']);
    const salt = await crypto.subtle.digest('SHA-256', encoder.encode(`runner-plaza:${userId}`));
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  function openKeyDb() {
    return new Promise((resolve, reject) => {
      // Safari 偶爾會讓 open 卡住：3 秒內沒開好就放棄，改請使用者輸入同步密碼
      let timedOut = false;
      const timer = window.setTimeout(() => { timedOut = true; reject(new Error('device key store timeout')); }, 3000);
      const request = indexedDB.open(DEVICE_KEY_DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(DEVICE_KEY_STORE);
      // 逾時後才開成功：立刻關掉，避免連線一直掛著擋住日後的資料庫升版
      request.onsuccess = () => { window.clearTimeout(timer); if (timedOut) request.result.close(); else resolve(request.result); };
      request.onerror = () => { window.clearTimeout(timer); reject(request.error); };
      request.onblocked = () => { window.clearTimeout(timer); reject(new Error('device key store blocked')); };
    });
  }

  async function keyStore(mode, action) {
    const db = await openKeyDb();
    try {
      return await new Promise((resolve, reject) => {
        const request = action(db.transaction(DEVICE_KEY_STORE, mode).objectStore(DEVICE_KEY_STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } finally {
      db.close();
    }
  }

  // 「記住這台裝置」存的是 extractable=false 的 CryptoKey：同步密碼不保存，金鑰也無法用 exportKey 匯出。
  // 限制：在本網站執行的程式（例如被注入的腳本）仍能用這把金鑰加解密；能讀這台電腦瀏覽器設定檔的人
  // 也可能取出金鑰。等同於這台裝置本身已保存的訓練資料的保護程度。IndexedDB 不可用時就只是不記住。
  const saveDeviceKey = (userId, key) => keyStore('readwrite', (store) => store.put(key, userId)).catch(() => null);
  const loadDeviceKey = (userId) => keyStore('readonly', (store) => store.get(userId)).catch(() => null);
  const clearDeviceKey = (userId) => keyStore('readwrite', (store) => store.delete(userId)).catch(() => null);

  // 教練週報密語跟著加密快照同步（伺服器只看到密文），新裝置登入後教練建議可直接解鎖。
  // 只在這台裝置還沒有密語時才採用：雲端可能是較舊的值，不能蓋掉本機已驗證可用的密語。
  function adoptCoachPassphrase(value) {
    if (!value || typeof value !== 'string') return false;
    try {
      if (localStorage.getItem(COACH_PASSPHRASE_KEY)) return false;
      localStorage.setItem(COACH_PASSPHRASE_KEY, value);
      return true;
    } catch { return false; }
  }

  function localCoachPassphrase() {
    try { return localStorage.getItem(COACH_PASSPHRASE_KEY) || ''; } catch { return ''; }
  }

  async function encryptSnapshot(data, userId) {
    const plaintext = JSON.stringify({ data: normalizeData(data), coachReviewPassphrase: localCoachPassphrase() });
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, syncKey, encoder.encode(plaintext));
    return { version: 2, iv: bytesToBase64(iv), cipher: bytesToBase64(new Uint8Array(cipher)) };
  }

  async function decryptSnapshot(envelope, userId, key = syncKey, { adopt = true } = {}) {
    if (!envelope || ![1, 2].includes(envelope.version) || !envelope.iv || !envelope.cipher) throw new Error('不支援的同步快照格式');
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(envelope.iv) }, key, base64ToBytes(envelope.cipher));
    const parsed = JSON.parse(decoder.decode(plaintext));
    // version 1：只有訓練資料（舊格式仍可讀）；version 2：另帶教練週報密語
    if (envelope.version === 2) {
      if (adopt && adoptCoachPassphrase(parsed.coachReviewPassphrase)) window.setTimeout(() => window.loadCoachReview?.(), 0);
      return normalizeData(parsed.data);
    }
    return normalizeData(parsed);
  }

  async function api(path, options = {}, retried = false) {
    const current = config();
    const session = readSession();
    if (!current || !session?.access_token) throw new Error('尚未登入同步帳號');
    const response = await fetch(`${current.url}${path}`, {
      ...options,
      headers: {
        apikey: current.publishableKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    if (response.status === 401 && !retried && await refreshSession()) return api(path, options, true);
    if (!response.ok) throw new Error((await response.text()) || `同步失敗（${response.status}）`);
    return response.status === 204 ? null : response.json();
  }

  async function readRemote() {
    const current = config();
    const userId = sessionUserId(readSession());
    const rows = await api(`/rest/v1/${current.table}?user_id=eq.${encodeURIComponent(userId)}&select=revision,payload,checksum,updated_at`);
    return rows?.[0] || null;
  }

  function hasMeaningfulData(data) {
    return Boolean(data?.profile || data?.plan?.length || data?.log?.length || data?.checkins?.length);
  }

  // 衝突判斷只看訓練資料本身。教練密語不參與衝突判斷，否則兩台密語狀態不同就會一直跳衝突視窗。
  async function checksum(data) {
    return digest(JSON.stringify(normalizeData(data)));
  }

  // 教練密語另外以本機 meta 的 coachDigest 追蹤：只在這台密語變了時補傳一次（只存在本機，不上傳）。
  async function coachDigest() {
    const coach = localCoachPassphrase();
    return coach ? digest(`coach:${coach}`) : '';
  }

  async function writeRemote(expectedRevision, force = false) {
    const current = config();
    const session = readSession();
    const userId = sessionUserId(session);
    const snapshotChecksum = await checksum(appData);
    const payload = await encryptSnapshot(appData, userId);
    const remote = force ? await readRemote() : null;
    const revision = force ? (remote?.revision || 0) : expectedRevision;
    const body = { user_id: userId, revision: revision + 1, payload, checksum: snapshotChecksum, updated_at: new Date().toISOString() };
    let result;
    if (revision === 0) {
      result = await api(`/rest/v1/${current.table}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
    } else {
      result = await api(`/rest/v1/${current.table}?user_id=eq.${encodeURIComponent(userId)}&revision=eq.${revision}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
    }
    if (!result?.length) throw new Error('conflict');
    storeMeta({ revision: result[0].revision, checksum: snapshotChecksum, updatedAt: result[0].updated_at, coachDigest: await coachDigest() });
    setStatus(`已同步 · ${new Date(result[0].updated_at).toLocaleString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`);
  }

  async function applyRemote(remote) {
    const userId = sessionUserId(readSession());
    const data = await decryptSnapshot(remote.payload, userId);
    if (hasMeaningfulData(appData)) {
      savePreRestoreSnapshot(appData, 'cloud-sync');
    }
    applyingRemote = true;
    try {
      const restored = saveData(data);
      if (!restored) throw new Error('training save failed');
      appData = restored;
      storeMeta({ revision: remote.revision, checksum: remote.checksum, updatedAt: remote.updated_at, coachDigest: await coachDigest() });
    } finally {
      applyingRemote = false;
    }
    if (appData.profile && appData.plan?.length) {
      renderPlanView();
      showView('plan');
    }
    setStatus(`已載入雲端資料 · ${new Date(remote.updated_at).toLocaleString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`);
  }

  // AES-GCM 解密失敗（OperationError）＝記住的金鑰與雲端不符，多半是同步密碼在別台裝置改過：
  // 清掉這台記住的金鑰，請使用者重新輸入，而不是每次開頁都靜默失敗。
  async function handleStaleKey(error) {
    if (error?.name !== 'OperationError') return false;
    const userId = sessionUserId(readSession());
    if (userId) await clearDeviceKey(userId);
    syncKey = null;
    setStatus('同步資料無法解密，請確認同步密碼；也可能是雲端資料損毀');
    return true;
  }

  function showConflict(remote) {
    setStatus('偵測到雙裝置版本差異');
    showModal('選擇要保留的訓練資料', '<p style="margin:0;line-height:1.75">這台裝置與雲端各有不同訓練資料，系統不會擅自混合兩份課表。若載入雲端版本，這台的資料會先自動保留為「匯入前快照」，可從「資料與備份」復原。</p>', [
      { label: '保留這台裝置', primary: true, action: async () => { closeModal(); try { await writeRemote(remote?.revision || 0, true); } catch { setStatus('同步失敗，請稍後再試'); } } },
      { label: '載入雲端版本（保留本機快照）', action: async () => { closeModal(); try { await applyRemote(remote); } catch (error) { if (!(await handleStaleKey(error))) setStatus('未能安全載入雲端資料，請檢查密碼與本機儲存空間'); } } },
      { label: '稍後決定', action: closeModal }
    ]);
  }

  async function reconcile() {
    if (!syncKey || !readSession()) return;
    try {
      const remote = await readRemote();
      const meta = readMeta();
      if (!remote) {
        await writeRemote(0);
        return;
      }
      const localChecksum = await checksum(appData);
      if (localChecksum === remote.checksum) {
        const hadLocalCoach = Boolean(localCoachPassphrase());
        // Confirm the encrypted snapshot before trusting its checksum or adopting a passphrase.
        const remoteData = await decryptSnapshot(remote.payload, sessionUserId(readSession()), syncKey, { adopt: false });
        if (await checksum(remoteData) !== localChecksum) throw new Error('cloud checksum mismatch');
        if (!localCoachPassphrase()) await decryptSnapshot(remote.payload, sessionUserId(readSession()));
        // 訓練資料一致；只有這台的教練密語變了（例如剛輸入）才補傳一次，讓其他新裝置拿得到
        const localCoach = await coachDigest();
        if (meta && hadLocalCoach && localCoach && localCoach !== (meta.coachDigest || '')) return await writeRemote(remote.revision);
        storeMeta({ revision: remote.revision, checksum: remote.checksum, updatedAt: remote.updated_at, coachDigest: localCoach });
        setStatus('所有裝置資料一致');
        return;
      }
      if (!meta && hasMeaningfulData(appData)) return showConflict(remote);
      // 必須 await：否則 applyRemote 的解密錯誤不會進到下面的 catch
      if (!meta || !hasMeaningfulData(appData)) return await applyRemote(remote);
      if (meta.revision === remote.revision) return await writeRemote(remote.revision);
      return showConflict(remote);
    } catch (error) {
      if (await handleStaleKey(error)) return;
      // 同步進行中被登出：不要用錯誤訊息蓋掉「尚未登入」
      if (!syncKey || !readSession()) return;
      console.warn('training sync reconcile failed', error);
      setStatus('同步暫時無法完成');
    }
  }

  function onLocalSave() {
    if (applyingRemote || !syncKey || !readSession()) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => { reconcile(); }, 900);
    setStatus('準備同步…');
  }

  async function loginWithPassword() {
    const email = document.getElementById('training-sync-email')?.value?.trim();
    const password = document.getElementById('training-sync-login-password')?.value || '';
    const current = config();
    if (!email || !password || !current) throw new Error('請輸入 Email 與密碼');
    const response = await fetch(`${current.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: current.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) throw new Error(await response.text());
    syncKey = null; // 新登入一律重新解鎖，避免沿用前一個帳號的金鑰
    storeSession(await response.json());
    closeModal();
    setStatus('已登入，請輸入同步密碼');
    openUnlockModal();
  }

  async function unlock() {
    const value = document.getElementById('training-sync-passphrase')?.value || '';
    const remember = document.getElementById('training-sync-remember')?.checked !== false;
    if (value.length < 10) return setStatus('同步密碼至少需要 10 個字元');
    const userId = sessionUserId(readSession());
    const candidate = await deriveKey(userId, value);
    // 先拿雲端快照試解密：密碼錯就停在這裡，不記住、不改寫雲端（避免打錯一個字就把雲端改用錯誤密碼加密）。
    const remote = await readRemote();
    if (remote?.payload) {
      try {
        await decryptSnapshot(remote.payload, userId, candidate, { adopt: false });
      } catch (error) {
        // 只有 AES-GCM 驗證失敗才代表密碼錯；其他錯誤（格式不支援、資料損毀）要說清楚，避免使用者一直重打密碼
        setStatus(error?.name === 'OperationError' ? '同步資料無法解密，請確認同步密碼；也可能是雲端資料損毀' : '雲端資料格式不支援或已損毀，請先更新網頁；仍無法解決請聯絡管理員');
        return;
      }
    }
    syncKey = candidate;
    const saved = remember ? await saveDeviceKey(userId, syncKey) : (await clearDeviceKey(userId), true);
    closeModal();
    setStatus(remember && saved === null ? '這台裝置無法記住金鑰（可能是私密瀏覽），下次需重新輸入' : '正在比對雲端資料…');
    await reconcile();
  }

  function openUnlockModal() {
    showModal('解鎖加密同步', '<p style="margin:0 0 14px;line-height:1.7">輸入你自己設定的同步密碼。此密碼不會上傳，也無法由網站找回。</p><label class="form-label" for="training-sync-passphrase">同步密碼</label><input id="training-sync-passphrase" class="form-input" type="password" autocomplete="current-password" placeholder="至少 10 個字元"><label for="training-sync-remember" style="display:flex;gap:8px;align-items:center;margin-top:12px;font-size:14px;line-height:1.5"><input id="training-sync-remember" type="checkbox" checked>記住這台裝置（之後打開自動同步，不用再輸入）</label>', [{ label: '解鎖並同步', primary: true, action: () => unlock().catch(() => setStatus('同步密碼不正確或連線失敗')) }, { label: '切換帳號', action: async () => { closeModal(); await forgetDevice(); openModal(); } }, { label: '取消', action: closeModal }]);
  }

  // 登出同步：清掉這台的登入資訊、記住的金鑰與版本快取，並請 Supabase 撤銷登入。
  // 本機的訓練資料與教練密語保留（那是這台裝置自己的資料，不是同步帳號的）。
  async function forgetDevice() {
    const session = readSession();
    const userId = sessionUserId(session);
    window.clearTimeout(saveTimer);
    syncKey = null;
    if (userId) {
      await clearDeviceKey(userId);
      try { localStorage.removeItem(`${META_KEY}:${userId}`); } catch {}
    }
    const current = config();
    if (current && session?.access_token) {
      // scope=local：只撤銷這台的登入；預設 global 會把其他裝置一起登出
      fetch(`${current.url}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: current.publishableKey, Authorization: `Bearer ${session.access_token}` } }).catch(() => null);
    }
    localStorage.removeItem(SESSION_KEY);
    setStatus('尚未登入');
  }

  // 開頁時：已登入且這台裝置記住了金鑰，就自動同步，不再要求輸入同步密碼。
  async function resumeRememberedDevice() {
    const userId = sessionUserId(readSession());
    if (!userId || !config()) return;
    const key = await loadDeviceKey(userId);
    // 等待期間若已登出或換帳號，就不要把舊帳號的金鑰設回去
    if (sessionUserId(readSession()) !== userId) return;
    if (!key) return setStatus('已登入，請輸入同步密碼');
    syncKey = key;
    setStatus('正在比對雲端資料…');
    await reconcile();
  }

  function openModal() {
    if (!config()) return setStatus('同步設定尚未完成');
    if (readSession() && syncKey) {
      showModal('跨裝置同步', '<p style="margin:0;line-height:1.7">這台裝置已登入並記住同步金鑰，訓練資料與教練週報密語會自動同步。登出同步只會停止這台裝置的同步，本機課表會保留。</p>', [{ label: '立即同步', primary: true, action: () => { closeModal(); reconcile(); } }, { label: '登出同步', action: async () => { closeModal(); await forgetDevice(); } }, { label: '關閉', action: closeModal }]);
      return;
    }
    if (!readSession()) {
      showModal('登入跨裝置同步', '<p style="margin:0 0 14px;line-height:1.7">使用管理員建立的帳號登入；登入後只會載入此帳號自己的訓練資料。</p><label class="form-label" for="training-sync-email">Email</label><input id="training-sync-email" class="form-input" type="email" autocomplete="username" placeholder="you@example.com"><label class="form-label" for="training-sync-login-password" style="display:block;margin-top:12px">密碼</label><input id="training-sync-login-password" class="form-input" type="password" autocomplete="current-password" placeholder="你的登入密碼">', [{ label: '登入', primary: true, action: () => loginWithPassword().catch((error) => setStatus(error?.message?.includes('Invalid login credentials') ? 'Email 或密碼錯誤' : '登入失敗，請稍後再試')) }, { label: '取消', action: closeModal }]);
      return;
    }
    openUnlockModal();
  }

  window.TrainerSync = { renderControl, refreshControl: () => setStatus(status), onLocalSave, openModal, reconcile };
  window.openTrainingSyncModal = openModal;
  if (readSession()) {
    setStatus('已登入，正在讀取裝置金鑰…');
    // 等 trainer.js 建好 appData 後再自動恢復同步
    window.addEventListener('load', () => {
      window.setTimeout(() => { resumeRememberedDevice().catch(() => setStatus('同步暫時無法完成')); }, 300);
    });
  }
})();
