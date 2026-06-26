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
