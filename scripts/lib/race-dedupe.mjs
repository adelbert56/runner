function hasText(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function linkValues(race) {
  return [race.official_event_url, race.registration_link, race.detail_url, race.source_registration_link]
    .filter(hasText)
    .map((value) => String(value).trim());
}

// Only merge on a stable platform event ID. Names, dates, distances, and a
// generic landing page are deliberately not enough to merge races.
export function strongIdentityTokens(race) {
  const tokens = new Set();
  for (const value of linkValues(race)) {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      const eventMainId = url.searchParams.get("EventMain_ID");
      if (host.endsWith("ctrun.com.tw") && eventMainId) {
        tokens.add(`ctrun-event:${eventMainId}`);
        continue;
      }
      const bijiCid = url.searchParams.get("cid");
      if (host.endsWith("running.biji.co") && bijiCid) {
        tokens.add(`biji-competition:${bijiCid}`);
        continue;
      }
      // Other URLs may be generic registration/search pages. Without an
      // immutable event identifier they are useful metadata, not merge proof.
    } catch {
      // Invalid links are not identity evidence.
    }
  }
  return [...tokens];
}

function completenessScore(race) {
  const fields = [
    "registration_link", "official_event_url", "detail_url", "registration_opens_at",
    "registration_deadline", "venue", "organizer", "fees", "quota", "verified_at",
    "start_times", "description", "verification_note",
  ];
  return fields.reduce((score, field) => score + (hasText(race[field]) ? 1 : 0), 0)
    + (Array.isArray(race.distances) ? race.distances.length : 0);
}

function preferredRace(a, b) {
  const scoreDiff = completenessScore(a) - completenessScore(b);
  if (scoreDiff !== 0) return scoreDiff > 0 ? a : b;
  return String(a.race_id || "").localeCompare(String(b.race_id || "")) <= 0 ? a : b;
}

function mergedValue(primary, secondary, field) {
  return hasText(primary[field]) ? primary[field] : secondary[field];
}

function mergeRacePair(a, b) {
  const primary = preferredRace(a, b);
  const secondary = primary === a ? b : a;
  const merged = { ...secondary, ...primary };
  for (const field of [
    "race_name", "race_date", "race_county", "registration_link", "official_event_url",
    "detail_url", "source_registration_link", "registration_opens_at", "registration_deadline",
    "venue", "organizer", "fees", "quota", "verified_at", "start_times", "description",
    "verification_note", "source_url",
  ]) {
    merged[field] = mergedValue(primary, secondary, field);
  }
  merged.distances = [...new Set([...(Array.isArray(primary.distances) ? primary.distances : []), ...(Array.isArray(secondary.distances) ? secondary.distances : [])])];
  const mergedIds = [...new Set([
    ...(Array.isArray(primary.merged_duplicate_race_ids) ? primary.merged_duplicate_race_ids : []),
    ...(Array.isArray(secondary.merged_duplicate_race_ids) ? secondary.merged_duplicate_race_ids : []),
    secondary.race_id,
  ].filter(hasText))];
  if (mergedIds.length) merged.merged_duplicate_race_ids = mergedIds;
  return merged;
}

export function compactRaces(races) {
  const compacted = [];
  const tokenIndex = new Map();
  const merges = [];

  for (const race of races) {
    const tokens = strongIdentityTokens(race);
    const matches = [...new Set(tokens.map((token) => tokenIndex.get(token)).filter((index) => index !== undefined))];
    if (!matches.length) {
      const index = compacted.length;
      compacted.push(race);
      for (const token of tokens) tokenIndex.set(token, index);
      continue;
    }

    let target = matches[0];
    const previous = compacted[target];
    compacted[target] = mergeRacePair(previous, race);
    for (const extra of matches.slice(1).sort((a, b) => b - a)) {
      if (extra === target) continue;
      compacted[target] = mergeRacePair(compacted[target], compacted[extra]);
      compacted.splice(extra, 1);
      if (extra < target) target -= 1;
      for (const [token, index] of tokenIndex) {
        if (index === extra) tokenIndex.set(token, target);
        else if (index > extra) tokenIndex.set(token, index - 1);
      }
    }
    for (const token of strongIdentityTokens(compacted[target])) tokenIndex.set(token, target);
    merges.push({
      kept_race_id: compacted[target].race_id || "",
      merged_race_id: race.race_id || "",
      identity_tokens: tokens,
    });
  }
  return { races: compacted, merges };
}
