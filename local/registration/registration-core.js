export function normalizeEntryKeyPart(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function entryDuplicateKey(entry) {
  return [
    entry.personId,
    entry.raceDate,
    normalizeEntryKeyPart(entry.raceName),
    normalizeEntryKeyPart(entry.distance),
  ].join("|");
}

export function findDuplicateEntry(entries, entry) {
  const key = entryDuplicateKey(entry);
  return entries.find((item) => item.id !== entry.id && entryDuplicateKey(item) === key) || null;
}

export function paymentAmountPresentation(value, isPaid = false) {
  const hasAmount = value !== null && value !== undefined && String(value).trim() !== "";
  const amount = Number(value);
  if (!hasAmount) {
    return { label: "金額未填", hint: "尚未填寫報名費", isMissing: true };
  }
  if (!Number.isFinite(amount)) {
    return { label: "金額格式待確認", hint: "請依原有流程核對金額", isMissing: true };
  }
  return {
    label: `NT$ ${amount.toLocaleString("zh-TW")}`,
    hint: amount === 0 ? "金額為 0" : isPaid ? "已確認收款" : "待收此筆費用",
    isMissing: false,
  };
}
