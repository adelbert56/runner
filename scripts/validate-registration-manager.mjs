import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { entryDuplicateKey, findDuplicateEntry } from "../local/registration/registration-core.js";

const root = resolve(import.meta.dirname, "..");
const checks = [];

function assertCheck(condition, message) {
  checks.push({ ok: Boolean(condition), message });
}

const baseEntry = {
  id: "entry_1",
  personId: "person_a",
  raceDate: "2026-09-20",
  raceName: "仁愛長庚合作聯盟醫院2026永慶盃路跑",
  distance: "10K",
};
const sameEntryDifferentSpacing = {
  id: "entry_2",
  personId: "person_a",
  raceDate: "2026-09-20",
  raceName: " 仁愛長庚合作聯盟醫院2026永慶盃路跑 ",
  distance: " 10k ",
};
const differentDistance = {
  ...sameEntryDifferentSpacing,
  id: "entry_3",
  distance: "3K",
};
const sameIdEdit = {
  ...sameEntryDifferentSpacing,
  id: "entry_1",
};

const server = await readFile(resolve(root, "site/server.mjs"), "utf8");
const gitignore = await readFile(resolve(root, ".gitignore"), "utf8");
const indexHtml = await readFile(resolve(root, "site/index.html"), "utf8");
const appJs = await readFile(resolve(root, "site/app.js"), "utf8");
const readme = await readFile(resolve(root, "README.md"), "utf8");
const registrationHtml = await readFile(resolve(root, "local/registration/registration.html"), "utf8");
const registrationJs = await readFile(resolve(root, "local/registration/registration.js"), "utf8");

assertCheck(
  entryDuplicateKey(baseEntry) === entryDuplicateKey(sameEntryDifferentSpacing),
  "registration duplicate key ignores case and surrounding spaces"
);
assertCheck(
  entryDuplicateKey(baseEntry) !== entryDuplicateKey(differentDistance),
  "registration duplicate key allows the same person to run a different distance"
);
assertCheck(
  findDuplicateEntry([baseEntry], sameEntryDifferentSpacing)?.id === "entry_1",
  "registration manager blocks same person, race date, race name, and distance duplicates"
);
assertCheck(
  findDuplicateEntry([baseEntry], sameIdEdit) === null,
  "registration manager allows editing the same entry"
);
assertCheck(
  /allowedLocalHosts/.test(server) && /Registration data is only available/.test(server),
  "registration API is restricted to local host requests"
);
assertCheck(
  /registrationPayloadLimit/.test(server) && /Payload too large/.test(server),
  "registration API rejects oversized payloads"
);
assertCheck(
  gitignore.includes("runner/報名管理/報名管理資料.json"),
  "private registration data file is ignored by git"
);
assertCheck(
  !indexHtml.includes("registration.html"),
  "public site HTML does not hard-link to the local-only registration manager"
);
assertCheck(
  appJs.includes("LOCAL_REGISTRATION_HREF") &&
    appJs.includes("isLocalHost") &&
    appJs.includes("data-local-only"),
  "public app only injects the registration manager entry on local hosts"
);
assertCheck(
  readme.includes("http://localhost:4173/local/registration/registration.html"),
  "README points registration manager users to the local-only URL"
);
assertCheck(
  registrationHtml.includes("/site/styles.css") &&
    registrationJs.includes("/site/data/races.json") &&
    registrationJs.includes("/api/registration-data"),
  "local registration manager stays outside the public site path while using local server data"
);
assertCheck(
  registrationHtml.includes('id="race-select"') &&
    registrationHtml.includes('id="use-selected-race"') &&
    registrationJs.includes("selectedRaceFromDropdown") &&
    !registrationJs.includes("data-use-race"),
  "registration manager uses a dropdown race picker instead of a long card list"
);
assertCheck(
  [
    "person-name",
    "person-gender",
    "person-shirt-size",
    "person-phone",
    "person-national-id",
    "person-birthday",
    "person-emergency-name",
    "person-emergency-relationship",
    "person-emergency-phone",
  ].every((id) => registrationHtml.includes(`id="${id}"`)) &&
    registrationJs.includes("missingPersonFields"),
  "registration person profile includes required identity and emergency-contact fields"
);
assertCheck(
    registrationHtml.includes('id="export-selected-race-payments"') &&
    registrationJs.includes("downloadSelectedRacePaymentCsv") &&
    registrationJs.includes("paymentExportRows") &&
    registrationJs.includes("繳費狀態") &&
    registrationJs.includes("手機末三碼") &&
    registrationJs.includes("phoneLastThree") &&
    registrationJs.includes("text/csv;charset=utf-8") &&
    registrationJs.includes("\\uFEFF"),
  "registration manager exports selected-race payment confirmation CSV"
);
assertCheck(
  registrationHtml.includes('id="export-selected-race-payment-html"') &&
    registrationJs.includes("downloadSelectedRacePaymentHtml") &&
    registrationJs.includes("buildPaymentReminderHtml") &&
    registrationJs.includes("Registration Payment Check") &&
    registrationJs.includes("報名繳費確認表") &&
    registrationJs.includes("text/html;charset=utf-8") &&
    registrationJs.includes("繳費確認截圖") &&
    !registrationJs.includes("催款"),
  "registration manager exports selected-race payment confirmation screenshot HTML"
);
assertCheck(
  registrationJs.includes("SELECTED_RACE_STORAGE_KEY") &&
    registrationJs.includes("savedSelectedRaceId") &&
    registrationJs.includes("saveSelectedRaceId") &&
    registrationJs.includes("localStorage") &&
    registrationJs.includes("els.raceSelect.value || savedSelectedRaceId()"),
  "registration manager restores the selected race after page refresh"
);

const failed = checks.filter((check) => !check.ok);
checks.forEach((check) => {
  console.log(`${check.ok ? "OK" : "FAIL"} ${check.message}`);
});

if (failed.length) {
  process.exitCode = 1;
}
