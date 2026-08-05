import assert from "node:assert/strict";
import { compactRaces, strongIdentityTokens } from "./lib/race-dedupe.mjs";

const detailed = {
  race_id: "detailed", race_name: "慵懶跑者聚樂部-COZY RUNNER CLUB", race_date: "2026-11-15",
  registration_link: "https://www.ctrun.com.tw/pageA.aspx?EventMain_ID=308&Register=True", distances: ["10km", "5km"],
  registration_opens_at: "2026-06-23",
};
const weakDuplicate = {
  race_id: "weak", race_name: "2026 國聚慵懶跑者聚樂部", race_date: "2026-11-15",
  official_event_url: "https://www.ctrun.com.tw/pageA.aspx?EventMain_ID=308", distances: ["10km", "5km"],
  source_url: "http://www.taipeimarathon.org.tw/contest.aspx",
};

assert.deepEqual(strongIdentityTokens(detailed), ["ctrun-event:308"]);
const result = compactRaces([detailed, weakDuplicate]);
assert.equal(result.races.length, 1);
assert.equal(result.merges.length, 1);
assert.equal(result.races[0].race_id, "detailed");
assert.deepEqual(result.races[0].merged_duplicate_race_ids, ["weak"]);
console.log("Race dedupe check: pass");
