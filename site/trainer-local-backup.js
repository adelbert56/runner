// Local-only durability and a narrowly scoped repair for the incomplete recovery package.
(() => {
  if (!['127.0.0.1', 'localhost'].includes(location.hostname) || location.port !== '4173') return;
  const repairVersion = '20261103-layout-strength2';
  let timer;
  let notified = false;
  async function backup(data, reason = 'automatic') {
    if (!data?.profile || !data.plan?.length) return null;
    const response = await fetch('http://127.0.0.1:4175/snapshot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, reason }), signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('本機獨立備份未成功');
    const receipt = await response.json();
    if (!receipt.verified) throw new Error('備份完整性尚未確認');
    window.TrainerLocalBackup.receipt = receipt;
    return receipt;
  }
  function report(error) {
    window.TrainerLocalBackup.error = error.message;
    if (!notified && typeof showModal === 'function') {
      notified = true;
      showModal('資料保護程序尚未完成', '<p>獨立備份或資料版本檢查未通過，請先匯出 JSON 備份，重新整理後再確認資料；系統不會將未完成的清理標示為成功。</p>', [{ label: '知道了', action: closeModal }]);
    }
  }
  function repair(current, config) {
    const next = structuredClone(current);
    const strengthDates = new Set(config.strengthDates);
    const coreDates = new Set(config.coreDates);
    for (const week of next.plan) {
      const date = week.days?.[0]?.dateStr;
      const phase = [...config.phases].reverse().find(item => item.start <= date);
      if (phase) {
        week.phaseLabel = phase.phase;
        week.phase = /減量/.test(phase.phase) ? 'taper' : /降載/.test(phase.phase) ? 'base' : 'build';
        week.isTaper = /減量/.test(phase.phase);
        week.isDeload = /降載/.test(phase.phase);
      }
      for (const day of week.days || []) {
        if (day.dateStr < config.asOf || day.status === 'done' || day.actualKm > 0) continue;
        if (!['restart-draft', 'reconstructed-preview', 'unavailable'].includes(day.recoveryState)) continue;
        day.task = String(day.task || '').replace(/^【[^】]*(?:重建|預覽)[^】]*】\s*/, '');
        if (day.type === 'rest') {
          const recovery = buildSupportBlocks('recovery', false, next.profile, week.weekNum, day.dow);
          if (strengthDates.has(day.dateStr) || coreDates.has(day.dateStr)) {
            const strength = structuredClone(buildSupportBlocks('strength', false, next.profile, week.weekNum, day.dow)[0]);
            strength.title = coreDates.has(day.dateStr) ? '核心與穩定（賽前輕量版）' : '肌力與核心（重啟短版）';
            strength.dose = coreDates.has(day.dateStr) ? '5–10 分' : '10–15 分';
            strength.detail = '恢復原系統動作圖解；重啟先各一組、不加重、不做到力竭。圖解為完整示範，劑量以這張卡為準；若痠痛或疲勞增加就取消。';
            strength.drills = strength.drills.filter(drill => !coreDates.has(day.dateStr) || /棒式|臀橋|平衡|蚌殼/.test(drill.name))
              .map(drill => ({ ...drill, dose: /秒/.test(drill.dose) ? '1 組 × 15–20 秒' : '1 組 × 6–8 次' }));
            if (!strength.drills.length) strength.drills = [{ name: '棒式', dose: '1 組 × 15–20 秒', visual: 'plank' }];
            day.task = strength.title;
            day.supportBlocks = [strength, ...recovery];
          } else day.supportBlocks = recovery;
        } else day.steps = attachCourseGuides(day.steps || [], day.type);
        day.layoutStrengthRepair = repairVersion;
        const frozen = next.frozenCourseArchive?.days?.[day.dateStr];
        if (frozen?.day && ['restart-draft', 'reconstructed-preview', 'unavailable'].includes(frozen.day.recoveryState)) frozen.day = structuredClone(day);
        const archived = next.coachPlanArchive?.weeks?.[String(week.weekNum)]?.days?.find(item => item.dateStr === day.dateStr);
        if (archived && ['restart-draft', 'reconstructed-preview', 'unavailable'].includes(archived.recoveryState)) Object.assign(archived, structuredClone(day));
      }
    }
    next.recoveryManifest.layoutStrengthRepairVersion = repairVersion;
    next.recoveryManifest.layoutStrengthRepairAt = new Date().toISOString();
    return next;
  }
  function removeRepeatedSummaries(current) {
    const seen = new Set();
    let removed = 0;
    const log = (current.log || []).filter(entry => {
      const summary = entry?.source === 'garmin' && !entry.activityId && !entry.garminActivityId &&
        ['Garmin 同步', 'Garmin 自動認列補跑'].includes(entry.notes) &&
        !Object.hasOwn(entry, 'hr') && !Object.hasOwn(entry, 'pace') && !Object.hasOwn(entry, 'recoveredActivityType');
      if (!summary) return true;
      const fingerprint = JSON.stringify(entry);
      if (seen.has(fingerprint)) { removed++; return false; }
      seen.add(fingerprint);
      return true;
    });
    return { data: { ...current, log }, removed };
  }
  async function start() {
    const previousSave = window.TrainerSync?.onLocalSave;
    if (window.TrainerSync) window.TrainerSync.onLocalSave = function (data) {
      previousSave?.call(this, data);
      clearTimeout(timer);
      const copy = structuredClone(data);
      timer = setTimeout(() => backup(copy).catch(report), 1200);
    };
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data?.profile || !data.plan?.length) return;
    const cleanup = removeRepeatedSummaries(data);
    if (cleanup.removed) {
      await backup(data, 'before-cleanup');
      await backup(cleanup.data, 'after-cleanup');
      if (localStorage.getItem(STORAGE_KEY) !== raw) throw new Error('其他分頁已更新資料；取消重複摘要清理');
      const cleanedRaw = JSON.stringify(cleanup.data);
      localStorage.setItem(STORAGE_KEY, cleanedRaw);
      if (localStorage.getItem(STORAGE_KEY) !== cleanedRaw) throw new Error('清理後資料寫入未確認');
      location.reload();
      return;
    }
    if (data.recoveryManifest?.kind !== 'partial-reconstruction' || data.recoveryManifest.layoutStrengthRepairVersion === repairVersion) {
      await backup(data); return;
    }
    await backup(data, 'before-repair');
    const response = await fetch('/output/recovery/layout-strength-config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('修復設定無法讀取；尚未改動課表');
    const config = await response.json();
    if (config.version !== repairVersion) throw new Error('修復版本不符；尚未改動課表');
    const next = repair(data, config);
    if (JSON.stringify(next.log) !== JSON.stringify(data.log)) throw new Error('實跑資料不一致；取消修復');
    for (const week of data.plan) for (const day of week.days || []) {
      const repaired = next.plan.find(item => item.weekNum === week.weekNum)?.days?.find(item => item.dateStr === day.dateStr);
      if (!repaired || repaired.km !== day.km || repaired.type !== day.type || repaired.status !== day.status) throw new Error('跑課內容變更；取消修復');
    }
    if (localStorage.getItem(STORAGE_KEY) !== raw) throw new Error('其他分頁已更新資料；取消本次修復以免覆蓋');
    await backup(next, 'after-repair');
    if (localStorage.getItem(STORAGE_KEY) !== raw) throw new Error('其他分頁已更新資料；取消本次修復以免覆蓋');
    // Both complete versions have been verified outside browser storage before committing.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (JSON.parse(localStorage.getItem(STORAGE_KEY)).recoveryManifest.layoutStrengthRepairVersion !== repairVersion) throw new Error('瀏覽器寫入未確認');
    location.reload();
  }
  window.TrainerLocalBackup = { backup, repair, removeRepeatedSummaries, receipt: null, error: null };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => start().catch(report), { once: true });
  else start().catch(report);
})();
