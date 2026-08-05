import assert from "node:assert/strict";
import { normalizeContentUrl } from "./lib/content-url.mjs";

const bijiOne = normalizeContentUrl("https://running.biji.co/index.php?q=news&act=info&id=114441&utm_source=feed#card");
const bijiTwo = normalizeContentUrl("https://running.biji.co/index.php?q=news&act=info&id=114444&utm_medium=email");

assert.notEqual(bijiOne, bijiTwo, "運動筆記不同 id 的文章不得被去重成同一篇");
assert.equal(
  normalizeContentUrl("https://example.com/article?id=9&utm_source=feed&fbclid=abc"),
  normalizeContentUrl("https://example.com/article?id=9"),
  "追蹤參數不應產生重複內容",
);

console.log("Content URL normalization checks passed.");
