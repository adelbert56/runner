import {
  normalizeArray,
  normalizeDistanceValue,
  normalizeEntryStatusValue,
  todayString,
  escapeHtml,
  normalizeMatchValue,
  formatMoney,
} from "./registration.js";

export function dedupeRaceDistances(race) {
  const distances = normalizeArray(race.distances).reduce((items, distance) => {
    const normalized = normalizeDistanceValue(distance);
    if (normalized && !items.includes(normalized)) {
      items.push(normalized);
    }
    return items;
  }, []);
  return distances.join(" / ");
}

export function raceId(race) {
  return race.race_id || race.id || race.race_name || race.name || "";
}

export function raceName(race) {
  return race.race_name || race.name || "未命名賽事";
}

export function compactRaceName(race) {
  return raceName(race)
    .replace(/20\d{2}\s*(?:年)?/g, "")
    .replace(/第[一二三四五六七八九十\d]+屆/g, "")
    .replace(/[〈〉《》「」]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 14) || "未命名賽事";
}

export function raceDateTag(race) {
  const date = String(race.race_date || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(5).replace("-", "/") : "日期待補";
}

export function compactRaceOptionLabel(race) {
  return [
    raceDateTag(race),
    compactRaceName(race),
    dedupeRaceDistances(race) || "距離待補",
  ].join("｜");
}

export function raceCounty(race) {
  return race.race_county || race.county || "";
}

export function raceLocation(race) {
  return race.venue || race.start_location || race.location || "";
}

export function formatRaceLocation(race) {
  return [raceCounty(race), raceLocation(race)].filter(Boolean).join(" · ");
}

export function raceDateValue(race) {
  return String(race?.race_date || "").slice(0, 10);
}

export function isClosedRaceStatus(value) {
  return ["已截止", "停辦", "停賽", "取消"].includes(normalizeEntryStatusValue(value));
}

export function hasOpenRegistrationWindow(race) {
  const deadline = String(race?.registration_deadline || "").slice(0, 10);
  return Boolean(deadline && deadline >= todayString());
}

export function workspaceRaceStatus(race) {
  if (normalizeEntryStatusValue(race?.registration_status) === "已截止" && hasOpenRegistrationWindow(race)) {
    return "報名中";
  }
  return race?.registration_status || "狀態待補";
}

export function isSelectableRace(race) {
  const raceDate = raceDateValue(race);
  const status = normalizeEntryStatusValue(race?.registration_status);
  if (["停辦", "停賽", "取消"].includes(status)) {
    return false;
  }
  if (status === "已截止" && !hasOpenRegistrationWindow(race)) {
    return false;
  }
  return !raceDate || raceDate >= todayString();
}

export function personLabel(person) {
  const shirt = person.defaultShirtSize ? ` · ${person.defaultShirtSize}` : "";
  return `${person.name}${shirt}`;
}

export function maskedPhone(value, visibleDigits = 3) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  const visible = digits.slice(-Math.max(0, visibleDigits));
  const masked = "*".repeat(Math.max(0, digits.length - visible.length));
  return `${masked}${visible}`;
}

export function overviewStatusTag(label, tone = "neutral") {
  return `<span class="status-tag status-tag-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

export function pendingTone(count) {
  if (count >= 2) {
    return "danger";
  }
  return count ? "pending" : "complete";
}

export function notifyRaceKey(entry) {
  return `${normalizeMatchValue(entry.raceName)}::${String(entry.raceDate || "").slice(0, 10)}`;
}

export function notifyRaceLabel(entry) {
  const raceDate = String(entry.raceDate || "").slice(0, 10);
  return [raceDate || "日期待補", entry.raceName || "未命名賽事"].join("｜");
}

export function notifyCardMessage(group) {
  const lines = group.entries.map((entry, index) => {
    const bits = [
      `${index + 1}. ${entry.raceName || "未命名賽事"}`,
      entry.raceDate ? `日期 ${String(entry.raceDate).slice(0, 10)}` : "",
      entry.distance ? `組別 ${entry.distance}` : "",
      `報名 ${entry.isRegistered ? "已完成" : "未完成"}`,
      `繳費 ${entry.isPaid ? "已完成" : "未完成"}`,
      entry.paidAmount ? `金額 ${formatMoney(entry.paidAmount)}` : "",
      entry.notes ? `備註 ${entry.notes}` : "",
    ].filter(Boolean);
    return bits.join("｜");
  });
  const totals = [
    group.unpaidAmount ? `待收合計：${formatMoney(group.unpaidAmount)}` : "",
    group.pendingCount ? `待處理筆數：${group.pendingCount}` : "目前皆已完成",
  ].filter(Boolean);
  return [
    `${group.name} 您好，`,
    "以下是目前報名狀態整理：",
    ...lines,
    ...totals,
  ].join("\n");
}

export function notifyCardPreviewSummary(group) {
  const previewEntries = group.entries.slice(0, 3).map((entry) => {
    const bits = [
      entry.raceDate ? String(entry.raceDate).slice(0, 10) : "日期待補",
      entry.raceName || "未命名賽事",
      entry.distance || "未填組別",
      entry.isPaid ? "已繳費" : entry.isRegistered ? "待繳費" : "待報名",
    ];
    return `• ${bits.join("｜")}`;
  });
  if (group.entries.length > 3) {
    previewEntries.push(`• 其餘 ${group.entries.length - 3} 場請直接開分頁查看摘要表`);
  }
  return [
    `${group.name} 目前共有 ${group.entries.length} 筆紀錄，待處理 ${group.pendingCount} 筆。`,
    group.unpaidAmount ? `待收總額 ${formatMoney(group.unpaidAmount)}。` : "目前沒有待收金額。",
    ...previewEntries,
  ].join("\n");
}

export function notifyIcon(name, className = "") {
  const icons = {
    race: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="13" height="11" rx="2"></rect><path d="M6.5 3.5v3M13.5 3.5v3M3.5 8.5h13"></path></svg>',
    record: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="3.5" width="11" height="13" rx="2"></rect><path d="M7.5 8h5M7.5 11h5M7.5 14h4"></path></svg>',
    shirt: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 5 10 3l3 2 3 1.5-1.5 3-2.5-1V16H8V8.5l-2.5 1L4 6.5 7 5Z"></path></svg>',
    phone: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.7 4.8c.4-.4 1-.5 1.5-.2l1.6 1c.5.3.7 1 .4 1.5l-.7 1.3a11.5 11.5 0 0 0 2.1 2.1l1.3-.7c.5-.3 1.1-.1 1.5.4l1 1.6c.3.5.2 1.1-.2 1.5l-.7.7c-.7.7-1.7 1-2.7.7-2.3-.7-4.4-2.8-5.1-5.1-.3-1 0-2 .7-2.7l.7-.7Z"></path></svg>',
    stack: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4 4 7l6 3 6-3-6-3Z"></path><path d="M4 10l6 3 6-3"></path><path d="M4 13l6 3 6-3"></path></svg>',
    pending: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="6.5"></circle><path d="M10 6.8v3.7l2.3 1.6"></path></svg>',
    money: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.2" width="13" height="9.6" rx="2"></rect><circle cx="10" cy="10" r="2.1"></circle><path d="M6 8.2h.01M14 11.8h.01"></path></svg>',
    person: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="6.6" r="2.6"></circle><path d="M5.2 15.2c1.3-2 3-3 4.8-3 1.8 0 3.5 1 4.8 3"></path></svg>',
    trophy: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4.5h6v2.1c0 2-1.3 3.8-3 4.5-1.7-.7-3-2.5-3-4.5V4.5Z"></path><path d="M6.8 5H4.8c0 2.1.8 3.4 2.4 4M13.2 5h2c0 2.1-.8 3.4-2.4 4M10 11.2v2.3M7.8 15.5h4.4"></path></svg>',
    bell: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4.3a3 3 0 0 0-3 3v1.2c0 .9-.3 1.7-.9 2.4l-.8.9h9.4l-.8-.9a3.6 3.6 0 0 1-.9-2.4V7.3a3 3 0 0 0-3-3Z"></path><path d="M8.5 14.3a1.7 1.7 0 0 0 3 0"></path></svg>',
    open: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 4.5h4v4"></path><path d="M15.3 4.7 9 11"></path><path d="M8.5 5.5h-3a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-3"></path></svg>',
    copy: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="6.2" width="8.3" height="10" rx="2"></rect><path d="M5.2 13.8H5a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2h6.3a2 2 0 0 1 2 2v.2"></path></svg>',
    chevron: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5.5 8 4.5 4.5L14.5 8"></path></svg>',
  };
  return `<span class="notify-icon${className ? ` ${className}` : ""}" aria-hidden="true">${icons[name] || ""}</span>`;
}

export function notifyMetaItem(icon, label, value, tone = "default") {
  return `
    <span class="notify-meta-item${tone !== "default" ? ` is-${tone}` : ""}">
      ${notifyIcon(icon)}
      <span>${escapeHtml(label)} ${escapeHtml(value)}</span>
    </span>
  `;
}

export function notifySummaryItem(icon, label, value, tone = "default") {
  return `
    <span class="notify-summary-item${tone !== "default" ? ` is-${tone}` : ""}">
      <span class="notify-summary-item-head">
        ${notifyIcon(icon)}
        <span>${escapeHtml(label)}</span>
      </span>
      <b>${escapeHtml(value)}</b>
    </span>
  `;
}

export function notifySummaryFacts(group) {
  const facts = [];
  facts.push(notifySummaryItem("person", "報名進度", `${group.registeredCount} / ${group.entries.length}`));
  facts.push(notifySummaryItem("stack", "涵蓋賽事", `${group.raceCount} 場`));
  facts.push(notifySummaryItem("race", "檔期", notifyRangeLabel(group), "date"));
  return facts.join("");
}

export function notifyRangeLabel(group) {
  const dated = group.entries
    .map((entry) => String(entry.raceDate || "").slice(0, 10))
    .filter(Boolean)
    .sort();
  if (!dated.length) return "日期待補";
  const first = formatNotifyRangeDate(dated[0]);
  const last = formatNotifyRangeDate(dated[dated.length - 1]);
  if (dated.length === 1 || first === last) return first;
  return `${first} - ${last}`;
}

export function formatNotifyRangeDate(dateText) {
  const [year, month, day] = String(dateText || "").slice(0, 10).split("-");
  if (!year || !month || !day) return String(dateText || "");
  return `${month}/${day}`;
}

export function isSameRaceEntry(entry, race) {
  const sameName = normalizeMatchValue(entry.raceName) === normalizeMatchValue(raceName(race));
  const raceDate = String(race.race_date || "").slice(0, 10);
  const sameDate = !raceDate || !entry.raceDate || String(entry.raceDate).slice(0, 10) === raceDate;
  return sameName && sameDate;
}

export const AVATAR_PALETTE = ["#1b6a4d", "#1c5f8a", "#a3671a", "#6a3f8a", "#3f6a1c", "#2f6f7d"];

export function avatarColor(name) {
  const key = String(name || "?").trim();
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}
