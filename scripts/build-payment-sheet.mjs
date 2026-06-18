// 注意：可編輯的 收款明細.xlsx 由 scripts/init-payment-xlsx.mjs 專管，
// 本腳本只產 md + svg，不碰 xlsx，避免蓋掉內含公式的 Excel。
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { todayInTaipei } from "./lib/time.mjs";

const root = resolve(import.meta.dirname, "..");
const today = process.env.RUNNER_TODAY || todayInTaipei();
const paths = {
  source: resolve(root, "runner/賽事/收款明細.json"),
  database: resolve(root, "runner/賽事/賽事資料庫.json"),
  md: resolve(root, "runner/賽事/收款明細.md"),
  svg: resolve(root, "runner/賽事/收款明細.svg"),
};

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf-8"));
  } catch (error) {
    console.error(`讀取失敗 ${path}: ${error.message}`);
    return fallback;
  }
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function shortDate(value) {
  if (!value) return "";
  return String(value).slice(5, 10); // MM-DD
}

function escapeXml(value) {
  return String(value ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}

function buildRaceIndex(database) {
  const list = Array.isArray(database)
    ? database
    : Array.isArray(database?.races)
      ? database.races
      : [];
  const index = new Map();
  for (const race of list) {
    if (race?.race_id) index.set(race.race_id, race);
  }
  return index;
}

// 把來源整理成結構化資料（之後三種輸出共用）
function buildModel(source, raceIndex) {
  const races = Array.isArray(source?.races) ? source.races : [];
  const model = races.map((race) => {
    if (race?.race_id) {
      const known = raceIndex.get(race.race_id);
      if (!known) {
        console.warn(`警告：race_id ${race.race_id} 在賽事資料庫找不到（${race.race_name ?? "未命名"}）`);
      } else if (known.race_name && race.race_name && known.race_name !== race.race_name) {
        console.warn(`警告：${race.race_id} 名稱不符 — 收款表「${race.race_name}」vs 資料庫「${known.race_name}」`);
      }
    }

    const payments = (Array.isArray(race?.payments) ? race.payments : []).map((p) => {
      if (p?.amount == null) {
        console.warn(`警告：${race?.race_name ?? "未命名"} 的「${p?.name ?? "?"}」缺 amount，當 0 計`);
      }
      return {
        name: p?.name ?? "",
        amount: num(p?.amount),
        paid: p?.paid === true,
        registered: p?.registered === true,
        paid_date: p?.paid_date ?? "",
        size: p?.size ?? "",
        note: p?.note ?? "",
      };
    });

    const total = payments.reduce((s, p) => s + p.amount, 0);
    const received = payments.filter((p) => p.paid).reduce((s, p) => s + p.amount, 0);
    const registeredCount = payments.filter((p) => p.registered).length;

    return {
      race_name: race?.race_name ?? "未命名賽事",
      race_date: race?.race_date ?? "",
      payments,
      total,
      received,
      unpaid: total - received,
      registeredCount,
    };
  });

  const grandTotal = model.reduce((s, r) => s + r.total, 0);
  const grandReceived = model.reduce((s, r) => s + r.received, 0);
  return { races: model, grandTotal, grandReceived };
}

// ---------- Markdown（Obsidian）----------
function renderMarkdown(model) {
  const blocks = model.races.map((race) => {
    const rows = race.payments.length
      ? race.payments.map(
          (p) => `| ${p.name} | ${p.amount} | ${p.paid ? "✅" : "❌"} | ${p.registered ? "✅" : "⬜"} | ${shortDate(p.paid_date)} | ${p.size} | ${p.note} |`,
        )
      : ["| _（無資料）_ |  |  |  |  |  |  |"];
    return [
      `## ${race.race_name}${race.race_date ? ` (${race.race_date})` : ""}`,
      `> 報名金額合計 ${race.total} / 已收 ${race.received} / 未收 ${race.unpaid} / 已幫報名 ${race.registeredCount}人`,
      "",
      "| 人名 | 報名金額 | 已付 | 已報名 | 付款日 | 衣服尺寸 | 備註 |",
      "|------|------:|:---:|:-----:|--------|:---:|------|",
      ...rows,
    ].join("\n");
  });

  return [
    "<!-- 此檔由 scripts/build-payment-sheet.mjs 自動產生，請勿手改；改 收款明細.json -->",
    "# 賽程收款明細表",
    `> 產生時間：${today}`,
    `> **總計已收 ${model.grandReceived} / 總金額 ${model.grandTotal}**`,
    "",
    model.races.length ? blocks.join("\n\n") : "_目前沒有收款資料。請編輯 收款明細.json 後重跑。_",
    "",
  ].join("\n");
}

// ---------- SVG（圖像）----------
function renderSvg(model) {
  const rowH = 30;
  const headH = 56;
  const cols = [
    { label: "人名", w: 130, align: "start", x: 14 },
    { label: "報名金額", w: 100, align: "end" },
    { label: "已付", w: 70, align: "middle" },
    { label: "已報名", w: 80, align: "middle" },
    { label: "付款日", w: 90, align: "start", x: 10 },
    { label: "尺寸", w: 60, align: "middle" },
    { label: "備註", w: 170, align: "start", x: 10 },
  ];
  const width = cols.reduce((s, c) => s + c.w, 0) + 40; // 20 padding each side
  const left = 20;

  // 計算列數
  let rowCount = 0;
  for (const race of model.races) rowCount += 1 /*title*/ + 1 /*header*/ + Math.max(race.payments.length, 1) + 1 /*subtotal*/;
  const height = headH + rowCount * rowH + 30;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="-apple-system,'Microsoft JhengHei',sans-serif">`);
  parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);
  parts.push(`<text x="${left}" y="28" font-size="20" font-weight="700" fill="#1f3864">賽程收款明細表</text>`);
  parts.push(`<text x="${width - 20}" y="28" font-size="13" fill="#1f3864" text-anchor="end">總計已收 ${model.grandReceived} / 總金額 ${model.grandTotal}（${today}）</text>`);

  let y = headH;
  const cellX = (i) => left + cols.slice(0, i).reduce((s, c) => s + c.w, 0);
  const textX = (i) => {
    const c = cols[i];
    const start = cellX(i);
    if (c.align === "end") return start + c.w - 12;
    if (c.align === "middle") return start + c.w / 2;
    return start + (c.x ?? 12);
  };
  const anchor = (a) => (a === "end" ? "end" : a === "middle" ? "middle" : "start");

  for (const race of model.races) {
    // 賽事標題列
    parts.push(`<rect x="${left}" y="${y}" width="${width - 40}" height="${rowH}" fill="#1f3864"/>`);
    parts.push(`<text x="${left + 12}" y="${y + 20}" font-size="14" font-weight="700" fill="#ffffff">${escapeXml(race.race_name)}${race.race_date ? `  (${race.race_date})` : ""}</text>`);
    y += rowH;

    // 欄位表頭
    parts.push(`<rect x="${left}" y="${y}" width="${width - 40}" height="${rowH}" fill="#d9e1f2"/>`);
    cols.forEach((c, i) => {
      parts.push(`<text x="${textX(i)}" y="${y + 20}" font-size="12" font-weight="700" fill="#1f3864" text-anchor="${anchor(c.align)}">${escapeXml(c.label)}</text>`);
    });
    y += rowH;

    // 資料列
    const rows = race.payments.length ? race.payments : [null];
    rows.forEach((p, idx) => {
      const bg = idx % 2 ? "#f6f8fc" : "#ffffff";
      parts.push(`<rect x="${left}" y="${y}" width="${width - 40}" height="${rowH}" fill="${bg}"/>`);
      if (p) {
        const cells = [p.name, String(p.amount), p.paid ? "✅" : "❌", p.registered ? "✅" : "⬜", shortDate(p.paid_date), p.size, p.note];
        cells.forEach((val, i) => {
          const color = i === 2 ? (p.paid ? "#2e7d32" : "#c62828") : "#222222";
          parts.push(`<text x="${textX(i)}" y="${y + 20}" font-size="12" fill="${color}" text-anchor="${anchor(cols[i].align)}">${escapeXml(val)}</text>`);
        });
      } else {
        parts.push(`<text x="${left + 12}" y="${y + 20}" font-size="12" fill="#999999">（無資料）</text>`);
      }
      y += rowH;
    });

    // 小計列
    parts.push(`<rect x="${left}" y="${y}" width="${width - 40}" height="${rowH}" fill="#f2f2f2"/>`);
    parts.push(`<text x="${left + 12}" y="${y + 20}" font-size="12" font-weight="700" fill="#444">小計　報名金額 ${race.total}　已收 ${race.received}　未收 ${race.unpaid}　已報名 ${race.registeredCount}人</text>`);
    y += rowH;
  }

  parts.push(`</svg>`);
  return parts.join("\n");
}

// ---------- main ----------
const source = await readJson(paths.source, { races: [] });
const database = await readJson(paths.database, []);
const model = buildModel(source, buildRaceIndex(database));

await writeFile(paths.md, renderMarkdown(model), "utf-8");
await writeFile(paths.svg, renderSvg(model), "utf-8");

console.log(`產出 ${model.races.length} 場 → md / svg。總計已收 ${model.grandReceived} / 總金額 ${model.grandTotal}。`);
