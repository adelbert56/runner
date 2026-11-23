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
  let syncKind = 'signedout';
  // 同步狀態種類：標題、是否在「管理」旁顯示提醒點，以及下一步按鈕。
  const SYNC_KINDS = {
    ok: { title: '已同步', actions: [['立即同步', 'TrainerSync.retry()'], ['設定', 'openTrainingSyncModal()']] },
    syncing: { title: '同步中…', actions: [] },
    offline: { title: '目前離線', badge: true, actions: [] },
    error: { title: '同步失敗', badge: true, actions: [['重試', 'TrainerSync.retry()', true], ['設定', 'openTrainingSyncModal()']] },
    locked: { title: '需要輸入同步密碼', badge: true, actions: [['輸入同步密碼', 'openTrainingSyncModal()', true]] },
    conflict: { title: '兩台裝置的資料不同', badge: true, actions: [['選擇要保留哪一份', 'TrainerSync.retry()', true]] },
    stalekey: { title: '同步密碼不符', badge: true, actions: [['重新輸入同步密碼', 'openTrainingSyncModal()', true]] },
    signedout: { title: '未開啟同步', actions: [['登入跨裝置同步', 'openTrainingSyncModal()']] }
  };

  function config() {
    const value = window.TRAINER_SYNC_CONFIG;
    return value?.url && value?.publishableKey ? value : null;
  }

  // kind 省略時只更新文字（例如登入表單的驗證訊息），不改變工具列的同步狀態與提醒點。
  function setStatus(next, kind) {
    status = next;
    if (kind && SYNC_KINDS[kind]) syncKind = kind;
    document.querySelectorAll('[data-training-sync-status]').forEach((node) => { node.textContent = next; });
    if (!kind) return;
    document.querySelectorAll('[data-training-sync-indicator]').forEach((node) => {
      node.setAttribute?.('data-sync-kind', syncKind);
      const title = node.querySelector?.('[data-training-sync-title]');
      if (title) title.textContent = SYNC_KINDS[syncKind].title;
      const actions = node.querySelector?.('[data-training-sync-actions]');
      if (actions) actions.innerHTML = renderActions();
    });
    document.querySelectorAll('[data-training-sync-badge]').forEach((node) => {
      node.setAttribute?.('data-sync-kind', syncKind);
      node.hidden = !SYNC_KINDS[syncKind].badge;
    });
  }

  function renderActions() {
    return SYNC_KINDS[syncKind].actions.map(([label, handler, primary]) =>
      `<button class="btn ${primary ? 'btn-primary' : 'btn-secondary'}" type="button" onclick="${handler}">${label}</button>`).join('');
  }

  function renderControl() {
    return `<div class="training-sync-control" data-training-sync-indicator data-sync-kind="${syncKind}">
      <div class="sync-status-head"><span class="sync-status-dot" aria-hidden="true"></span><strong data-training-sync-title>${SYNC_KINDS[syncKind].title}</strong></div>
      <span data-training-sync-status role="status" aria-live="polite">${status}</span>
      <div class="sync-status-actions" data-training-sync-actions>${renderActions()}</div>
    </div>`;
  }

  // 「管理」按鈕旁的提醒點：只有需要處理（失敗、待解鎖、資料不同、離線）時出現。
  function renderBadge() {
    const needsAttention = Boolean(SYNC_KINDS[syncKind].badge);
    return `<span class="sync-attention-dot" data-training-sync-badge data-sync-kind="${syncKind}" role="img" aria-label="跨裝置同步需要處理"${needsAttention ? '' : ' hidden'}></span>`;
  }

  // 今天 10:38／昨天 21:05／11/20 21:05：隔天打開也分得出是不是今天同步的。
  function formatSyncTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (dayKey(date) === dayKey(today)) return `今天 ${time}`;
    if (dayKey(date) === dayKey(yesterday)) return `昨天 ${time}`;
    return `${date.getMonth() + 1}/${date.getDate()} ${time}`;
  }

  function isOffline(error) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    return error instanceof TypeError; // fetch 連不上網路時丟 TypeError
  }

  function syncFailureReason(error) {
    const code = Number(error?.status) || 0;
    if (code === 401 || code === 403) return '登入已過期，請按「設定」重新登入';
    if (code === 429) return '同步太頻繁，請等一下再試';
    if (code >= 500) return '雲端伺服器暫時沒有回應';
    return '雲端回應異常';
  }

  // 同步失敗或離線：說明原因、提醒資料仍在本機，並附上一次成功的時間。
  function reportSyncFailure(error) {
    const last = readMeta()?.updatedAt;
    const lastText = last ? `上次成功：${formatSyncTime(last)}` : '';
    if (isOffline(error)) {
      return setStatus(['修改會先存在這台裝置，連上網路後自動同步。', lastText].filter(Boolean).join(' '), 'offline');
    }
    setStatus([`${syncFailureReason(error)}。資料仍在這台裝置，不會遺失。`, lastText].filter(Boolean).join(' '), 'error');
  }

  function retry() {
    if (!readSession() || !syncKey) return openModal();
    setStatus('正在比對雲端資料…', 'syncing');
    return reconcile();
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

  function sessionClaims(session) {
    try {
      const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(payload)) || {};
    } catch { return {}; }
  }

  function sessionUserId(session) {
    return sessionClaims(session).sub || '';
  }

  function sessionEmail(session) {
    return session?.user?.email || sessionClaims(session).email || '';
  }

  function escapeAttr(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // 密碼管理器以「帳號名稱 + 密碼欄類型」分辨要存哪一組。登入密碼與同步密碼若共用同一個 Email
  // 且都標 current-password，瀏覽器會把兩組當成同一個密碼互相覆蓋或填錯，所以同步密碼另給一個帳號名稱。
  function syncPassphraseAccount(email) {
    return email ? `${email}（同步密碼）` : '同步密碼';
  }

  function hiddenAccountField(value) {
    return `<input type="text" name="username" autocomplete="username" value="${escapeAttr(value)}" hidden readonly tabindex="-1" aria-hidden="true">`;
  }

  function passwordField(id, autocomplete, placeholder) {
    return `<span class="password-field"><input id="${id}" name="${id}" class="form-input" type="password" autocomplete="${autocomplete}" placeholder="${placeholder}"><button type="button" class="password-toggle" aria-label="顯示密碼" aria-pressed="false" title="顯示密碼" onclick="TrainerSync.togglePasswordVisibility(&quot;${id}&quot;, this)"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></span>`;
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
      window.setTimeout(() => window.loadCoachReview?.(), 0);
      return true;
    } catch { return false; }
  }

  function localCoachPassphrase() {
    try { return localStorage.getItem(COACH_PASSPHRASE_KEY) || ''; } catch { return ''; }
  }

  function togglePasswordVisibility(id, button) {
    const input = document.getElementById(id);
    if (!input || !button) return;
    const start = input.selectionStart, end = input.selectionEnd;
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    button.setAttribute('aria-label', reveal ? '隱藏密碼' : '顯示密碼');
    button.setAttribute('aria-pressed', String(reveal));
    button.title = reveal ? '隱藏密碼' : '顯示密碼';
    input.focus({ preventScroll: true });
    if (start != null && end != null) input.setSelectionRange(start, end);
  }

  async function encryptSnapshot(data, userId) {
    const plaintext = JSON.stringify({ data: normalizeData(data), coachReviewPassphrase: localCoachPassphrase() });
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, syncKey, encoder.encode(plaintext));
    return { version: 2, iv: bytesToBase64(iv), cipher: bytesToBase64(new Uint8Array(cipher)) };
  }

  async function decryptSnapshot(envelope, key = syncKey) {
    if (!envelope || ![1, 2].includes(envelope.version) || !envelope.iv || !envelope.cipher) throw new Error('不支援的同步快照格式');
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(envelope.iv) }, key, base64ToBytes(envelope.cipher));
    const parsed = JSON.parse(decoder.decode(plaintext));
    // version 1：只有訓練資料（舊格式仍可讀）；version 2：另帶教練週報密語
    return envelope.version === 2
      ? { data: normalizeData(parsed.data), coachPassphrase: parsed.coachReviewPassphrase }
      : { data: normalizeData(parsed), coachPassphrase: '' };
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
    if (!response.ok) {
      const error = new Error((await response.text()) || `同步失敗（${response.status}）`);
      error.status = response.status;
      throw error;
    }
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
    setStatus(`${formatSyncTime(result[0].updated_at)} · 已上傳這台裝置的修改`, 'ok');
  }

  async function applyRemote(remote, localBaseline) {
    const key = syncKey;
    const { data, coachPassphrase } = await decryptSnapshot(remote.payload, key);
    if (localBaseline !== undefined &&
        (key !== syncKey || !readSession() || localBaseline !== JSON.stringify(normalizeData(appData)))) return;
    if (hasMeaningfulData(appData)) {
      savePreRestoreSnapshot(appData, 'cloud-sync');
    }
    applyingRemote = true;
    try {
      const restored = saveData(data);
      if (!restored) throw new Error('training save failed');
      appData = restored;
      adoptCoachPassphrase(coachPassphrase);
      storeMeta({ revision: remote.revision, checksum: remote.checksum, updatedAt: remote.updated_at, coachDigest: await coachDigest() });
    } finally {
      applyingRemote = false;
    }
    if (appData.profile && appData.plan?.length) {
      renderPlanView();
      showView('plan');
    }
    setStatus(`${formatSyncTime(remote.updated_at)} · 已載入雲端資料`, 'ok');
  }

  // AES-GCM 解密失敗（OperationError）＝記住的金鑰與雲端不符，多半是同步密碼在別台裝置改過：
  // 清掉這台記住的金鑰，請使用者重新輸入，而不是每次開頁都靜默失敗。
  async function handleStaleKey(error) {
    if (error?.name !== 'OperationError') return false;
    const userId = sessionUserId(readSession());
    if (userId) await clearDeviceKey(userId);
    syncKey = null;
    setStatus('同步資料無法解密，請確認同步密碼；也可能是雲端資料損毀', 'stalekey');
    return true;
  }

  function showConflict(remote) {
    setStatus('這台裝置和雲端各有不同的修改，請選擇要保留哪一份。', 'conflict');
    showModal('選擇要保留的訓練資料', '<p style="margin:0;line-height:1.75">這台裝置與雲端各有不同訓練資料，系統不會擅自混合兩份課表。若載入雲端版本，這台的資料會先自動保留為「匯入前快照」，可從「資料與備份」復原。</p>', [
      { label: '保留這台裝置', primary: true, action: async () => { closeModal(); try { await writeRemote(remote?.revision || 0, true); } catch (error) { reportSyncFailure(error); } } },
      { label: '載入雲端版本（保留本機快照）', action: async () => { closeModal(); try { await applyRemote(remote); } catch (error) { if (!(await handleStaleKey(error))) setStatus('未能安全載入雲端資料，請檢查密碼與本機儲存空間', 'error'); } } },
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
      const localBaseline = JSON.stringify(normalizeData(appData));
      const localChecksum = await digest(localBaseline);
      if (localChecksum === remote.checksum) {
        // Confirm the encrypted snapshot before trusting its checksum or adopting a passphrase.
        const snapshot = await decryptSnapshot(remote.payload);
        if (await checksum(snapshot.data) !== localChecksum) throw new Error('cloud checksum mismatch');
        const localCoachPass = localCoachPassphrase();
        const cloudHasCoach = typeof snapshot.coachPassphrase === 'string' && Boolean(snapshot.coachPassphrase);
        if (!localCoachPass) adoptCoachPassphrase(snapshot.coachPassphrase);
        // 訓練資料一致；只有這台的教練密語變了（例如剛輸入）才補傳一次，讓其他新裝置拿得到
        const localCoach = await coachDigest();
        if (localCoachPass && localCoachPass !== snapshot.coachPassphrase &&
            (!cloudHasCoach || (meta && localCoach !== (meta.coachDigest || '')))) {
          return await writeRemote(remote.revision);
        }
        storeMeta({ revision: remote.revision, checksum: remote.checksum, updatedAt: remote.updated_at, coachDigest: localCoach });
        setStatus(`${formatSyncTime(remote.updated_at)} · 所有裝置資料一致`, 'ok');
        return;
      }
      if (!meta && hasMeaningfulData(appData)) return showConflict(remote);
      // 必須 await：否則 applyRemote 的解密錯誤不會進到下面的 catch
      if (!meta || !hasMeaningfulData(appData)) return await applyRemote(remote);
      if (remote.revision > meta.revision && localChecksum === meta.checksum) return await applyRemote(remote, localBaseline);
      if (meta.revision === remote.revision) return await writeRemote(remote.revision);
      return showConflict(remote);
    } catch (error) {
      if (await handleStaleKey(error)) return;
      // 同步進行中被登出：不要用錯誤訊息蓋掉「尚未登入」
      if (!syncKey || !readSession()) return;
      console.warn('training sync reconcile failed', error);
      reportSyncFailure(error);
    }
  }

  function onLocalSave() {
    if (applyingRemote || !syncKey || !readSession()) return;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(reconcile, 900);
    setStatus('有新的修改，稍後自動同步…', 'syncing');
  }

  async function loginWithPassword() {
    const email = document.getElementById('training-sync-email')?.value?.trim();
    const password = document.getElementById('training-sync-login-password')?.value || '';
    const current = config();
    if (!email || !password || !current) return setStatus('請輸入 Email 與密碼');
    setStatus('正在登入，請稍候…');
    const response = await fetch(`${current.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: current.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) throw new Error(await response.text());
    syncKey = null; // 新登入一律重新解鎖，避免沿用前一個帳號的金鑰
    storeSession(await response.json());
    closeModal();
    setStatus('已登入，請輸入同步密碼', 'locked');
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
        await decryptSnapshot(remote.payload, candidate);
      } catch (error) {
        // 只有 AES-GCM 驗證失敗才代表密碼錯；其他錯誤（格式不支援、資料損毀）要說清楚，避免使用者一直重打密碼
        setStatus(error?.name === 'OperationError' ? '同步資料無法解密，請確認同步密碼；也可能是雲端資料損毀' : '雲端資料格式不支援或已損毀，請先更新網頁；仍無法解決請聯絡管理員');
        return;
      }
    }
    syncKey = candidate;
    const saved = remember ? await saveDeviceKey(userId, syncKey) : (await clearDeviceKey(userId), true);
    closeModal();
    setStatus(remember && saved === null ? '這台裝置無法記住金鑰（可能是私密瀏覽），下次需重新輸入' : '正在比對雲端資料…', 'syncing');
    await reconcile();
  }

  function openUnlockModal() {
    const account = syncPassphraseAccount(sessionEmail(readSession()));
    showModal('解鎖加密同步', `<p style="margin:0 0 14px;line-height:1.7">輸入你自己設定的同步密碼（不是登入密碼）。此密碼不會上傳，也無法由網站找回；建議存進瀏覽器的密碼管理器，帳號名稱會顯示為「${escapeAttr(account)}」。</p><form onsubmit="return false">${hiddenAccountField(account)}<label class="form-label" for="training-sync-passphrase">同步密碼</label>${passwordField('training-sync-passphrase', 'current-password', '至少 10 個字元')}</form><p data-training-sync-status role="status" aria-live="polite"></p>` + '<label for="training-sync-remember" style="display:flex;gap:8px;align-items:center;margin-top:12px;font-size:14px;line-height:1.5"><input id="training-sync-remember" type="checkbox" checked>記住這台裝置（之後打開自動同步，不用再輸入）</label>', [{ label: '解鎖並同步', primary: true, action: () => unlock().catch(() => setStatus('同步密碼不正確或連線失敗')) }, { label: '切換帳號', action: async () => { closeModal(); await forgetDevice(); openModal(); } }, { label: '取消', action: closeModal }], { className: 'sync-modal' });
    focusField('training-sync-passphrase');
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
    setStatus('尚未登入', 'signedout');
  }

  // 開頁時：已登入且這台裝置記住了金鑰，就自動同步，不再要求輸入同步密碼。
  async function resumeRememberedDevice() {
    const userId = sessionUserId(readSession());
    if (!userId || !config()) return;
    const key = await loadDeviceKey(userId);
    // 等待期間若已登出或換帳號，就不要把舊帳號的金鑰設回去
    if (sessionUserId(readSession()) !== userId) return;
    if (!key) return setStatus('已登入，請輸入同步密碼', 'locked');
    syncKey = key;
    setStatus('正在比對雲端資料…', 'syncing');
    await reconcile();
  }

  // 忘記登入密碼：請 Supabase 寄重設信，信中連結帶回本頁（網址 # 後面附 type=recovery 的一次性登入）。
  // 只影響登入密碼；同步密碼與雲端加密資料不變，重設後用原本的同步密碼即可解鎖。
  async function requestPasswordReset() {
    const email = document.getElementById('training-sync-email')?.value?.trim();
    const current = config();
    if (!current) return setStatus('同步設定尚未載入，請重新整理頁面');
    if (!email) return setStatus('請先在上方輸入 Email，再按寄重設信');
    setStatus('正在寄送重設信…');
    const returnTo = window.location ? `${window.location.origin}${window.location.pathname}` : '';
    const response = await fetch(`${current.url}/auth/v1/recover${returnTo ? `?redirect_to=${encodeURIComponent(returnTo)}` : ''}`, {
      method: 'POST',
      headers: { apikey: current.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    }).catch(() => null);
    if (response?.status === 429) return setStatus('寄信太頻繁，請等幾分鐘再試');
    if (!response?.ok) return setStatus('重設信寄送失敗，請稍後再試');
    // 不論帳號是否存在都顯示同一句，避免被拿來試探哪些 Email 有帳號
    setStatus('若此 Email 有帳號，重設信已寄出。請到信箱（含垃圾郵件）點連結，會回到本頁設定新密碼。');
  }

  // 重設信帶回的一次性登入只放在這個分頁的 sessionStorage，等新密碼存好才變成正式登入；
  // 取消、按 Esc 或重新整理都還能回到設定新密碼，不會把連結白白用掉，也不會留下沒設密碼的登入。
  const RECOVERY_KEY = 'runner-trainer:sync-recovery:v1';
  let pendingRecovery = null;

  function readPendingRecovery() {
    if (pendingRecovery) return pendingRecovery;
    try { return JSON.parse(window.sessionStorage?.getItem(RECOVERY_KEY) || 'null'); } catch { return null; }
  }

  function storePendingRecovery(session) {
    pendingRecovery = session;
    try {
      if (session) window.sessionStorage?.setItem(RECOVERY_KEY, JSON.stringify(session));
      else window.sessionStorage?.removeItem(RECOVERY_KEY);
    } catch {}
  }

  // 讀取重設信帶回的網址片段，並立刻從網址與歷史紀錄移除，避免 token 停留在網址列或被分享出去。
  function takeRecoveryFromUrl() {
    const hash = window.location?.hash || '';
    if (!/(type=recovery|error_code=)/.test(hash)) return null;
    const params = new URLSearchParams(hash.slice(1));
    try { window.history?.replaceState(null, '', `${window.location.pathname}${window.location.search}`); } catch {}
    if (params.get('error_code')) return { error: params.get('error_code') };
    if (params.get('type') !== 'recovery' || !params.get('access_token')) return null;
    return { session: { access_token: params.get('access_token'), refresh_token: params.get('refresh_token'), token_type: params.get('token_type') || 'bearer', expires_in: Number(params.get('expires_in')) || 3600 } };
  }

  // 解鎖／設密碼視窗的第一個欄位是給密碼管理器看的隱藏帳號欄，焦點要直接放到密碼框
  function focusField(id) {
    window.requestAnimationFrame?.(() => window.requestAnimationFrame?.(() => document.getElementById(id)?.focus?.()));
  }

  async function saveNewPassword() {
    const password = document.getElementById('training-sync-new-password')?.value || '';
    const confirm = document.getElementById('training-sync-new-password-confirm')?.value || '';
    const session = readPendingRecovery();
    const current = config();
    if (!session?.access_token || !current) return setStatus('重設連結已失效，請重新申請重設信');
    if (password.length < 8) return setStatus('新密碼至少需要 8 個字元');
    if (password !== confirm) return setStatus('兩次輸入的新密碼不一樣');
    setStatus('正在儲存新密碼…');
    const response = await fetch(`${current.url}/auth/v1/user`, {
      method: 'PUT',
      headers: { apikey: current.publishableKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    }).catch(() => null);
    if (!response?.ok) {
      const detail = response ? await response.text().catch(() => '') : '';
      if (/different from the old/i.test(detail)) return setStatus('新密碼不能和舊密碼相同');
      if (/weak|at least/i.test(detail)) return setStatus('新密碼太簡單，請加長或混合英數字');
      if (response?.status === 401 || response?.status === 403) {
        storePendingRecovery(null);
        return setStatus('重設連結已過期，請關閉後重新申請重設信');
      }
      return setStatus('新密碼儲存失敗，請稍後再試');
    }
    const user = await response.json().catch(() => null);
    storePendingRecovery(null);
    syncKey = null;
    storeSession(user?.email ? { ...session, user } : session);
    closeModal();
    setStatus('登入密碼已更新，請輸入同步密碼', 'locked');
    await resumeRememberedDevice();
    if (!syncKey) openUnlockModal();
  }

  function openNewPasswordModal() {
    const email = sessionEmail(readPendingRecovery());
    showModal('設定新的登入密碼', `<p style="margin:0 0 14px;line-height:1.7">${email ? `帳號 ${escapeAttr(email)}。` : ''}只會更換登入密碼；雲端訓練資料仍用原本的同步密碼解鎖。</p><form onsubmit="return false">${hiddenAccountField(email)}<label class="form-label" for="training-sync-new-password">新登入密碼</label>${passwordField('training-sync-new-password', 'new-password', '至少 8 個字元')}<label class="form-label" for="training-sync-new-password-confirm" style="display:block;margin-top:12px">再輸入一次</label>${passwordField('training-sync-new-password-confirm', 'new-password', '再輸入一次新密碼')}</form><p data-training-sync-status role="status" aria-live="polite"></p>`, [{ label: '儲存新密碼', primary: true, action: () => saveNewPassword().catch(() => setStatus('新密碼儲存失敗，請稍後再試')) }, { label: '稍後再設', action: closeModal }], { className: 'sync-modal' });
    focusField('training-sync-new-password');
  }

  function showRecoveryError() {
    showModal('重設連結無法使用', '<p style="margin:0;line-height:1.7">連結已過期或已經用過。請重新開啟「跨裝置同步」，按「忘記登入密碼」再寄一次。</p>', [{ label: '重新寄信', primary: true, action: () => { closeModal(); openModal(); } }, { label: '關閉', action: closeModal }], { className: 'sync-modal' });
  }

  function openModal() {
    if (!config()) {
      showModal('無法開啟同步', '<p>同步設定尚未載入，請重新整理頁面；若仍無法使用，請稍後再試。</p>', [{ label: '關閉', action: closeModal }]);
      return;
    }
    if (readPendingRecovery()) {
      openNewPasswordModal();
      return;
    }
    if (readSession() && syncKey) {
      showModal('跨裝置同步', '<p style="margin:0;line-height:1.7">這台裝置已登入並記住同步金鑰，訓練資料與教練週報密語會自動同步。登出同步只會停止這台裝置的同步，本機課表會保留。</p>', [{ label: '立即同步', primary: true, action: () => { closeModal(); reconcile(); } }, { label: '登出同步', action: async () => { closeModal(); await forgetDevice(); } }, { label: '關閉', action: closeModal }]);
      return;
    }
    if (!readSession()) {
      showModal('登入跨裝置同步', `<p style="margin:0 0 14px;line-height:1.7">使用管理員建立的帳號登入；登入後只會載入此帳號自己的訓練資料。</p><form onsubmit="return false"><label class="form-label" for="training-sync-email">Email</label><input id="training-sync-email" name="email" class="form-input" type="email" autocomplete="username" placeholder="you@example.com"><label class="form-label" for="training-sync-login-password" style="display:block;margin-top:12px">登入密碼</label>${passwordField('training-sync-login-password', 'current-password', '你的登入密碼')}</form><p data-training-sync-status role="status" aria-live="polite"></p><button type="button" class="sync-forgot-link" style="min-height:44px;padding:4px 0;border:0;background:none;color:var(--c-primary);font-size:14px;text-decoration:underline;cursor:pointer" onclick="TrainerSync.requestPasswordReset()">忘記登入密碼？寄重設信給我</button>`, [{ label: '登入', primary: true, action: () => loginWithPassword().catch((error) => setStatus(error?.message?.includes('Invalid login credentials') ? 'Email 或密碼錯誤；忘記密碼可按下方寄重設信' : '登入失敗，請稍後再試')) }, { label: '取消', action: closeModal }], { className: 'sync-modal' });
      return;
    }
    openUnlockModal();
  }

  window.TrainerSync = { togglePasswordVisibility, renderControl, renderBadge, refreshControl: () => setStatus(status, syncKind), onLocalSave, openModal, reconcile, retry, requestPasswordReset };
  // 斷網時先說清楚，連回網路就自動補同步
  window.addEventListener?.('offline', () => { if (syncKey && readSession()) reportSyncFailure(new TypeError('offline')); });
  window.addEventListener?.('online', () => (syncKey && readSession() ? retry() : undefined));
  window.openTrainingSyncModal = openModal;
  // 過期／已用過的連結：清掉先前未完成的重設，並把錯誤記在分頁裡，等待期間重新整理也看得到下一步說明
  const RECOVERY_ERROR_KEY = `${RECOVERY_KEY}:error`;
  const recoveryReturn = takeRecoveryFromUrl();
  if (recoveryReturn?.session) {
    storePendingRecovery(recoveryReturn.session);
    try { window.sessionStorage?.removeItem(RECOVERY_ERROR_KEY); } catch {}
  }
  if (recoveryReturn?.error) {
    storePendingRecovery(null);
    try { window.sessionStorage?.setItem(RECOVERY_ERROR_KEY, recoveryReturn.error); } catch {}
  }
  const takeRecoveryError = () => {
    try {
      const code = window.sessionStorage?.getItem(RECOVERY_ERROR_KEY);
      window.sessionStorage?.removeItem(RECOVERY_ERROR_KEY);
      return code || recoveryReturn?.error || null;
    } catch { return recoveryReturn?.error || null; }
  };
  let recoveryErrorPending = false;
  try { recoveryErrorPending = Boolean(window.sessionStorage?.getItem(RECOVERY_ERROR_KEY)); } catch {}
  if (recoveryReturn || recoveryErrorPending || readPendingRecovery() || readSession()) {
    setStatus(recoveryReturn || recoveryErrorPending || readPendingRecovery() ? '正在開啟密碼重設…' : '已登入，正在讀取裝置金鑰…', 'syncing');
    // 等 trainer.js 建好 appData（與 showModal）後再處理；重設中先設新密碼，不自動用舊登入恢復同步
    window.addEventListener('load', () => {
      window.setTimeout(() => {
        if (takeRecoveryError()) return showRecoveryError();
        if (readPendingRecovery()) return openNewPasswordModal();
        resumeRememberedDevice().catch(reportSyncFailure);
      }, 300);
    });
  }
})();
