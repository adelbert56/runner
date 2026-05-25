import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { todayInTaipei } from "./lib/time.mjs";

const root = resolve(import.meta.dirname, "..");
const outputPath = resolve(root, "site/data/message-cloud.json");
const repo = process.env.GITHUB_REPOSITORY || "adelbert56/runner";
const issueNumber = Number(process.env.MESSAGE_CLOUD_ISSUE_NUMBER || 34);
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const sourceUrl = `https://github.com/${repo}/issues/${issueNumber}`;
const targetCloudSize = 24;
const maxCloudSize = 48;
const maxMessagesPerUser = 8;
const blockedPatterns = [
  /加\s*(line|賴)/i,
  /line\s*id/i,
  /博弈|博彩|賭場|賭博/,
  /色情|約炮|援交/,
  /貸款|代操|投資群|虛擬貨幣/,
  /免費領|點擊領|私訊我/,
];

const fallbackMessages = [
  { text: "報名不要拖", weight: 5 },
  { text: "今天跑慢一點也算跑", weight: 4 },
  { text: "補給站不是自助餐", weight: 3 },
  { text: "配速比嘴硬重要", weight: 5 },
  { text: "看到坡先不要罵", weight: 3 },
  { text: "鞋帶綁好再出門", weight: 4 },
  { text: "天氣熱就放過自己", weight: 3 },
  { text: "完賽照要先想姿勢", weight: 2 },
  { text: "半馬不是半條命", weight: 4 },
  { text: "今天不拚命 明天還能跑", weight: 3 },
  { text: "別被關門車追著談戀愛", weight: 2 },
  { text: "早餐不要亂實驗", weight: 5 },
  { text: "報名費會變成動力", weight: 3 },
  { text: "跑完再說不跑了", weight: 4 },
  { text: "補水不是灌水", weight: 2 },
  { text: "今天的我先謝謝終點的我", weight: 3 },
];

function cleanLine(line) {
  return String(line || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^[>\s#*-]+/g, "")
    .replace(/^\d+[.)、]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function messageKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[，、。！？!?,.;:；：\s"'「」『』()（）[\]【】]/g, "")
    .trim();
}

function isAllowedMessage(text) {
  const value = String(text || "").trim();
  if (!value || value.length < 2 || value.length > 32) {
    return false;
  }
  if (/([!?！？。~～])\1{2,}/.test(value)) {
    return false;
  }
  if (/(.)\1{5,}/.test(value)) {
    return false;
  }
  return !blockedPatterns.some((pattern) => pattern.test(value));
}

function extractMessages(body) {
  const lines = String(body || "")
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(isAllowedMessage)
    .filter((line) => !/^(@|\/|<!--)/.test(line));

  if (lines.length) {
    return lines.slice(0, 5);
  }

  const compact = cleanLine(body);
  return isAllowedMessage(compact) ? [compact] : [];
}

function reactionWeight(comment) {
  const reactions = comment.reactions || {};
  const count = ["+1", "heart", "hooray", "laugh"].reduce((sum, key) => sum + Number(reactions[key] || 0), 0);
  return Math.min(5, 2 + count);
}

async function fetchIssueComments() {
  if (!token) {
    return [];
  }

  const comments = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub comments request failed: ${response.status} ${response.statusText}`);
    }
    const pageItems = await response.json();
    comments.push(...pageItems);
    if (!Array.isArray(pageItems) || pageItems.length < 100) {
      break;
    }
  }
  return comments;
}

async function readExistingMessages() {
  try {
    const existing = JSON.parse(await readFile(outputPath, "utf8"));
    return Array.isArray(existing.messages) && existing.messages.length ? existing.messages : fallbackMessages;
  } catch {
    return fallbackMessages;
  }
}

function mergeMessage(bucket, text, weight, origin = "issue") {
  const key = messageKey(text);
  if (!key) {
    return;
  }
  const current = bucket.get(key) || { text, weight: 0, origin };
  current.weight = Math.min(5, Math.max(current.weight, weight));
  current.origin = current.origin === "issue" ? "issue" : origin;
  bucket.set(key, current);
}

function buildCloud(comments) {
  const bucket = new Map();
  const authorCounts = new Map();

  comments
    .filter((comment) => comment.user?.type !== "Bot")
    .forEach((comment) => {
      const author = comment.user?.login || "anonymous";
      const weight = reactionWeight(comment);
      extractMessages(comment.body).forEach((text) => {
        const used = authorCounts.get(author) || 0;
        if (used >= maxMessagesPerUser) {
          return;
        }
        authorCounts.set(author, used + 1);
        mergeMessage(bucket, text, weight, "issue");
      });
    });

  const issueMessages = [...bucket.values()]
    .sort((a, b) => Number(b.origin === "issue") - Number(a.origin === "issue") || b.weight - a.weight || a.text.localeCompare(b.text, "zh-Hant"))
    .slice(0, maxCloudSize);

  const seedSlots = Math.max(0, targetCloudSize - issueMessages.length);
  fallbackMessages.slice(0, seedSlots).forEach((message) => {
    mergeMessage(bucket, message.text, message.weight, "seed");
  });

  return [...bucket.values()]
    .sort((a, b) => Number(b.origin === "issue") - Number(a.origin === "issue") || b.weight - a.weight || a.text.localeCompare(b.text, "zh-Hant"))
    .slice(0, maxCloudSize);
}

function nextUpdateLabel(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const shouldUseTomorrow = Number(values.hour) > 14 || (Number(values.hour) === 14 && Number(values.minute) >= 17);
  const date = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + (shouldUseTomorrow ? 1 : 0)));
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} 14:17 Asia/Taipei`;
}

const comments = await fetchIssueComments();
const messages = buildCloud(comments);
const output = {
  generated_at: todayInTaipei(),
  source: "github_issue",
  issue_number: issueNumber,
  source_url: sourceUrl,
  next_update_at: nextUpdateLabel(),
  policy: {
    max_visible_items: maxCloudSize,
    target_items_before_seed_retirement: targetCloudSize,
    max_messages_per_user: maxMessagesPerUser,
    seed_messages_retire_as_issue_messages_grow: true,
  },
  messages: messages.length ? messages : await readExistingMessages(),
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Built ${output.messages.length} message cloud items from issue #${issueNumber}.`);
