// Encrypted, account-scoped training snapshots for cross-device use.
// The passphrase never leaves this browser and Supabase only receives ciphertext.
(() => {
  const SESSION_KEY = 'runner-trainer:sync-session:v1';
  const META_KEY = 'runner-trainer:sync-meta:v1';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let passphrase = '';
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
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
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
    if (userId) localStorage.setItem(`${META_KEY}:${userId}`, JSON.stringify(meta));
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

  async function encryptSnapshot(data, userId) {
    const plaintext = JSON.stringify(normalizeData(data));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(userId, passphrase);
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plaintext));
    return { version: 1, iv: bytesToBase64(iv), cipher: bytesToBase64(new Uint8Array(cipher)) };
  }

  async function decryptSnapshot(envelope, userId) {
    if (!envelope || envelope.version !== 1 || !envelope.iv || !envelope.cipher) throw new Error('不支援的同步快照格式');
    const key = await deriveKey(userId, passphrase);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(envelope.iv) }, key, base64ToBytes(envelope.cipher));
    return normalizeData(JSON.parse(decoder.decode(plaintext)));
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

  async function checksum(data) {
    return digest(JSON.stringify(normalizeData(data)));
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
    storeMeta({ revision: result[0].revision, checksum: snapshotChecksum, updatedAt: result[0].updated_at });
    setStatus(`已同步 · ${new Date(result[0].updated_at).toLocaleString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`);
  }

  async function applyRemote(remote) {
    const userId = sessionUserId(readSession());
    const data = await decryptSnapshot(remote.payload, userId);
    const localChecksum = await checksum(appData);
    if (hasMeaningfulData(appData) && localChecksum !== remote.checksum) {
      try {
        localStorage.setItem(PRE_RESTORE_STORAGE_KEY, JSON.stringify({
          savedAt: new Date().toISOString(),
          reason: 'cloud-sync',
          data: normalizeData(appData)
        }));
      } catch (error) {
        console.warn('training pre-sync snapshot unavailable', error);
      }
    }
    applyingRemote = true;
    try {
      appData = data;
      saveData(appData);
      storeMeta({ revision: remote.revision, checksum: remote.checksum, updatedAt: remote.updated_at });
    } finally {
      applyingRemote = false;
    }
    if (appData.profile && appData.plan?.length) {
      renderPlanView();
      showView('plan');
    }
    setStatus(`已載入雲端資料 · ${new Date(remote.updated_at).toLocaleString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`);
  }

  function showConflict(remote) {
    setStatus('偵測到雙裝置版本差異');
    showModal('選擇要保留的訓練資料', '<p style="margin:0;line-height:1.75">這台裝置與雲端各有不同訓練資料，系統不會擅自混合兩份課表。若載入雲端版本，這台的資料會先自動保留為「匯入前快照」，可從「資料與備份」復原。</p>', [
      { label: '保留這台裝置', primary: true, action: async () => { closeModal(); try { await writeRemote(remote?.revision || 0, true); } catch { setStatus('同步失敗，請稍後再試'); } } },
      { label: '載入雲端版本（保留本機快照）', action: async () => { closeModal(); try { await applyRemote(remote); } catch { setStatus('同步密碼不正確或快照無法讀取'); } } },
      { label: '稍後決定', action: closeModal }
    ]);
  }

  async function reconcile() {
    if (!passphrase || !readSession()) return;
    try {
      const remote = await readRemote();
      const meta = readMeta();
      if (!remote) {
        await writeRemote(0);
        return;
      }
      const localChecksum = await checksum(appData);
      if (!meta && hasMeaningfulData(appData)) return showConflict(remote);
      if (!meta || (!hasMeaningfulData(appData) && localChecksum !== remote.checksum)) return applyRemote(remote);
      if (localChecksum === remote.checksum) {
        storeMeta({ revision: remote.revision, checksum: remote.checksum, updatedAt: remote.updated_at });
        setStatus('所有裝置資料一致');
        return;
      }
      if (meta.revision === remote.revision) return writeRemote(remote.revision);
      return showConflict(remote);
    } catch (error) {
      console.warn('training sync reconcile failed', error);
      setStatus('同步暫時無法完成');
    }
  }

  function onLocalSave() {
    if (applyingRemote || !passphrase || !readSession()) return;
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
    storeSession(await response.json());
    closeModal();
    setStatus('已登入，請輸入同步密碼');
    openUnlockModal();
  }

  async function unlock() {
    const value = document.getElementById('training-sync-passphrase')?.value || '';
    if (value.length < 10) return setStatus('同步密碼至少需要 10 個字元');
    passphrase = value;
    closeModal();
    setStatus('正在比對雲端資料…');
    await reconcile();
  }

  function openUnlockModal() {
    showModal('解鎖加密同步', '<p style="margin:0 0 14px;line-height:1.7">輸入你自己設定的同步密碼。此密碼不會上傳，也無法由網站找回。</p><label class="form-label" for="training-sync-passphrase">同步密碼</label><input id="training-sync-passphrase" class="form-input" type="password" autocomplete="current-password" placeholder="至少 10 個字元">', [{ label: '解鎖並同步', primary: true, action: () => unlock().catch(() => setStatus('同步密碼不正確或連線失敗')) }, { label: '切換帳號', action: () => { localStorage.removeItem(SESSION_KEY); passphrase = ''; closeModal(); openModal(); } }, { label: '取消', action: closeModal }]);
  }

  function openModal() {
    if (!config()) return setStatus('同步設定尚未完成');
    if (!readSession()) {
      showModal('登入跨裝置同步', '<p style="margin:0 0 14px;line-height:1.7">使用管理員建立的帳號登入；登入後只會載入此帳號自己的訓練資料。</p><label class="form-label" for="training-sync-email">Email</label><input id="training-sync-email" class="form-input" type="email" autocomplete="username" placeholder="you@example.com"><label class="form-label" for="training-sync-login-password" style="display:block;margin-top:12px">密碼</label><input id="training-sync-login-password" class="form-input" type="password" autocomplete="current-password" placeholder="你的登入密碼">', [{ label: '登入', primary: true, action: () => loginWithPassword().catch((error) => setStatus(error?.message?.includes('Invalid login credentials') ? 'Email 或密碼錯誤' : '登入失敗，請稍後再試')) }, { label: '取消', action: closeModal }]);
      return;
    }
    openUnlockModal();
  }

  window.TrainerSync = { renderControl, refreshControl: () => setStatus(status), onLocalSave, openModal, reconcile };
  window.openTrainingSyncModal = openModal;
  if (readSession()) setStatus('已登入，請輸入同步密碼');
})();
