import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { todayInTaipei } from "./lib/time.mjs";

const root = resolve(import.meta.dirname, "..");
const outputPath = resolve(root, "site/data/message-cloud.json");
const repo = process.env.GITHUB_REPOSITORY || "adelbert56/runner";
const issueNumber = Number(process.env.MESSAGE_CLOUD_ISSUE_NUMBER || 34);
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const sourceUrl = `https://github.com/${repo}/issues/${issueNumber}`;

const fallbackMessages = [
  { text: "報名不要拖", weight: 5 },
  { text: "今天跑慢一點也算跑", weight: 4 },
  { text: "補給站不是自助餐", weight: 3 },
  { text: "配速比嘴硬重要", weight: 5 },
  { text: "看到坡先不要罵", weight: 3 },
  { text: "鞋帶綁好再出門", weight: 4 },
  { text: "天氣熱就放過自己", weight: 3 },
  { text: "早餐不要亂實驗", weight: 5 },
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

function extractMessages(body) {
  const lines = String(body || "")
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line.length >= 2 && line.length <= 32)
    .filter((line) => !/^(@|\/|<!--)/.test(line));

  if (lines.length) {
    return lines.slice(0, 5);
  }

  const compact = cleanLine(body);
  return compact.length >= 2 && compact.length <= 32 ? [compact] : [];
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

function buildCloud(comments) {
  const bucket = new Map();
  comments
    .filter((comment) => comment.user?.type !== "Bot")
    .forEach((comment) => {
      const weight = reactionWeight(comment);
      extractMessages(comment.body).forEach((text) => {
        const current = bucket.get(text) || { text, weight: 0 };
        current.weight = Math.min(5, current.weight + weight);
        bucket.set(text, current);
      });
    });

  return [...bucket.values()]
    .sort((a, b) => b.weight - a.weight || a.text.localeCompare(b.text, "zh-Hant"))
    .slice(0, 48);
}

const comments = await fetchIssueComments();
const messages = buildCloud(comments);
const output = {
  generated_at: todayInTaipei(),
  source: "github_issue",
  issue_number: issueNumber,
  source_url: sourceUrl,
  messages: messages.length ? messages : await readExistingMessages(),
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Built ${output.messages.length} message cloud items from issue #${issueNumber}.`);
