// 注意：可編輯的 收款明細.xlsx 由 scripts/init-payment-xlsx.mjs 專管，
// 本腳本只產 md + svg + html，不碰 xlsx，避免蓋掉內含公式的 Excel。
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { todayInTaipei } from "./lib/time.mjs";

const root = resolve(import.meta.dirname, "..");
const today = process.env.RUNNER_TODAY || todayInTaipei();
const paths = {
  source: resolve(root, "runner/賽事/收款明細.json"),
  xlsx: resolve(root, "runner/賽事/收款明細.xlsx"),
  database: resolve(root, "runner/賽事/賽事資料庫.json"),
  md: resolve(root, "runner/賽事/收款明細.md"),
  svg: resolve(root, "runner/賽事/收款明細.svg"),
  html: resolve(root, "runner/賽事/收款明細.html"),
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

function normalizeText(value) {
  return String(value ?? "").trim();
}

function excelDateToIso(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = normalizeText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return text;
}

function shortDate(value) {
  if (!value) return "";
  return String(value).slice(5, 10);
}

function displayDate(value) {
  if (!value) return "";
  return String(value).replace(/-/g, "/");
}

function formatMoney(value) {
  return `NT$ ${num(value).toLocaleString("zh-TW")}`;
}

function escapeXml(value) {
  return String(value ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
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

function truthyCell(value) {
  const text = normalizeText(value).toLowerCase();
  return text === "是" || text === "true" || text === "yes" || text === "y" || text === "1";
}

async function readXlsxSource(path) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path);
    const worksheet = workbook.getWorksheet("收款明細") ?? workbook.worksheets[0];
    if (!worksheet) {
      console.warn(`警告：${path} 沒有工作表，改用 JSON。`);
      return null;
    }

    const races = [];
    const raceMap = new Map();
    for (let rowNumber = 6; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const raceName = normalizeText(row.getCell(1).value);
      const name = normalizeText(row.getCell(2).value);
      const amountRaw = row.getCell(3).value;
      const paidRaw = row.getCell(4).value;
      const registeredRaw = row.getCell(5).value;
      const paidDateRaw = row.getCell(6).value;
      const size = normalizeText(row.getCell(7).value);
      const note = normalizeText(row.getCell(8).value);
      const isCompletelyBlank = !raceName && !name && !amountRaw && !paidRaw && !registeredRaw && !paidDateRaw && !size && !note;

      if (isCompletelyBlank) continue;
      if (!raceName && !name) continue;

      const payment = {
        name,
        amount: num(amountRaw),
        paid: truthyCell(paidRaw),
        registered: truthyCell(registeredRaw),
        paid_date: excelDateToIso(paidDateRaw),
        size,
        note,
      };

      if (!raceMap.has(raceName)) {
        const race = { race_id: "", race_name: raceName || "未命名賽事", race_date: "", payments: [] };
        raceMap.set(raceName, race);
        races.push(race);
      }
      raceMap.get(raceName).payments.push(payment);
    }

    return { races };
  } catch (error) {
    console.error(`讀取失敗 ${path}: ${error.message}`);
    return null;
  }
}

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

function buildPeopleModel(model) {
  const peopleMap = new Map();
  for (const race of model.races) {
    for (const payment of race.payments) {
      const name = payment.name || "未命名";
      if (!peopleMap.has(name)) {
        peopleMap.set(name, {
          name,
          entries: [],
          total: 0,
          paidTotal: 0,
          unpaidTotal: 0,
          paidCount: 0,
          unpaidCount: 0,
          registeredCount: 0,
          sizeSet: new Set(),
        });
      }
      const person = peopleMap.get(name);
      const entry = {
        race_name: race.race_name,
        race_date: race.race_date,
        amount: payment.amount,
        paid: payment.paid,
        registered: payment.registered,
        paid_date: payment.paid_date,
        size: payment.size,
        note: payment.note,
      };
      person.entries.push(entry);
      person.total += payment.amount;
      if (payment.paid) {
        person.paidTotal += payment.amount;
        person.paidCount += 1;
      } else {
        person.unpaidTotal += payment.amount;
        person.unpaidCount += 1;
      }
      if (payment.registered) person.registeredCount += 1;
      if (payment.size) person.sizeSet.add(payment.size);
    }
  }

  const people = [...peopleMap.values()]
    .map((person) => ({
      ...person,
      sizes: [...person.sizeSet].sort(),
      sizeSummary: [...person.sizeSet].sort().join(" / "),
      entries: person.entries.sort((a, b) => `${a.race_date}|${a.race_name}`.localeCompare(`${b.race_date}|${b.race_name}`, "zh-Hant")),
    }))
    .sort((a, b) => {
      if (b.unpaidTotal !== a.unpaidTotal) return b.unpaidTotal - a.unpaidTotal;
      return a.name.localeCompare(b.name, "zh-Hant");
    });

  const notificationPeople = people.filter((person) => person.unpaidCount > 0);
  return {
    people,
    totals: {
      personCount: people.length,
      registrationCount: people.reduce((sum, person) => sum + person.entries.length, 0),
      unpaidEntryCount: people.reduce((sum, person) => sum + person.unpaidCount, 0),
      unpaidPeopleCount: notificationPeople.length,
      registeredEntryCount: people.reduce((sum, person) => sum + person.registeredCount, 0),
    },
  };
}

function buildNotificationText(person) {
  const pending = person.entries.filter((entry) => !entry.paid);
  if (!pending.length) {
    return `${person.name} 目前已無待收款項。`;
  }
  const lines = pending.map((entry, index) => {
    const bits = [
      `${index + 1}. ${entry.race_name}${entry.race_date ? `（${displayDate(entry.race_date)}）` : ""}`,
      `金額 ${formatMoney(entry.amount)}`,
    ];
    if (entry.note) bits.push(`備註 ${entry.note}`);
    return bits.join("｜");
  });
  return [
    `${person.name} 您好，`,
    "以下賽事報名費目前尚未收到，麻煩確認：",
    ...lines,
    `待收合計：${formatMoney(person.unpaidTotal)}`,
  ].join("\n");
}

function renderMarkdown(model) {
  const showSummary = model.races.length > 1;
  const summaryRows = showSummary
    ? [
        "| 賽事 | 總額 | 已收 | 未收 | 已報名 |",
        "|------|----:|----:|----:|------:|",
        ...model.races.map((race) => `| ${race.race_name}${race.race_date ? ` (${race.race_date})` : ""} | ${race.total} | ${race.received} | ${race.unpaid} | ${race.registeredCount} |`),
      ]
    : [];
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
    "<!-- 此檔由 scripts/build-payment-sheet.mjs 自動產生，請勿手改；優先改 收款明細.xlsx，若無 Excel 才退回 收款明細.json -->",
    "# 賽程收款明細表",
    `> 產生時間：${today}`,
    `> **總計已收 ${model.grandReceived} / 總金額 ${model.grandTotal}**`,
    "",
    showSummary ? "## 多賽事摘要\n" + summaryRows.join("\n") + "\n" : "",
    model.races.length ? blocks.join("\n\n") : "_目前沒有收款資料。請編輯 收款明細.xlsx 後重跑。_",
    "",
  ].join("\n");
}

function renderSvg(model) {
  const rowH = 30;
  const headH = 56;
  const showSummary = model.races.length > 1;
  const summaryHeadH = 28;
  const cols = [
    { label: "人名", w: 130, align: "start", x: 14 },
    { label: "報名金額", w: 100, align: "end" },
    { label: "已付", w: 70, align: "middle" },
    { label: "已報名", w: 80, align: "middle" },
    { label: "付款日", w: 90, align: "start", x: 10 },
    { label: "尺寸", w: 60, align: "middle" },
    { label: "備註", w: 170, align: "start", x: 10 },
  ];
  const width = cols.reduce((s, c) => s + c.w, 0) + 40;
  const left = 20;
  const summaryCols = [
    { label: "賽事", w: 310, align: "start", x: 12 },
    { label: "總額", w: 90, align: "end" },
    { label: "已收", w: 90, align: "end" },
    { label: "未收", w: 90, align: "end" },
    { label: "已報名", w: 90, align: "middle" },
  ];
  const summaryWidth = summaryCols.reduce((s, c) => s + c.w, 0);
  const summaryRows = Math.max(model.races.length, 1);
  const summaryBlockH = showSummary ? 66 + summaryRows * rowH : 0;

  let rowCount = 0;
  for (const race of model.races) rowCount += 1 + 1 + Math.max(race.payments.length, 1) + 1;
  const height = headH + summaryBlockH + rowCount * rowH + 30;

  const parts = [];
  const anchor = (a) => (a === "end" ? "end" : a === "middle" ? "middle" : "start");
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="-apple-system,'Microsoft JhengHei',sans-serif">`);
  parts.push(`<rect width="${width}" height="${height}" fill="#ffffff"/>`);
  parts.push(`<text x="${left}" y="28" font-size="20" font-weight="700" fill="#1f3864">賽程收款明細表</text>`);
  parts.push(`<text x="${width - 20}" y="28" font-size="13" fill="#1f3864" text-anchor="end">總計已收 ${model.grandReceived} / 總金額 ${model.grandTotal}（${today}）</text>`);
  if (showSummary) {
    parts.push(`<rect x="${left}" y="${headH - 8}" width="${summaryWidth}" height="${summaryHeadH}" fill="#d9e1f2"/>`);
    parts.push(`<text x="${left + 12}" y="${headH + 11}" font-size="13" font-weight="700" fill="#1f3864">多賽事摘要</text>`);

    const summaryCellX = (i) => left + summaryCols.slice(0, i).reduce((s, c) => s + c.w, 0);
    const summaryTextX = (i) => {
      const c = summaryCols[i];
      const start = summaryCellX(i);
      if (c.align === "end") return start + c.w - 12;
      if (c.align === "middle") return start + c.w / 2;
      return start + (c.x ?? 12);
    };

    let summaryY = headH + 20;
    parts.push(`<rect x="${left}" y="${summaryY}" width="${summaryWidth}" height="${rowH}" fill="#1f3864"/>`);
    summaryCols.forEach((c, i) => {
      parts.push(`<text x="${summaryTextX(i)}" y="${summaryY + 20}" font-size="12" font-weight="700" fill="#ffffff" text-anchor="${anchor(c.align)}">${escapeXml(c.label)}</text>`);
    });
    summaryY += rowH;

    model.races.forEach((race, idx) => {
      const bg = idx % 2 ? "#f6f8fc" : "#ffffff";
      parts.push(`<rect x="${left}" y="${summaryY}" width="${summaryWidth}" height="${rowH}" fill="${bg}"/>`);
      const cells = [
        `${race.race_name}${race.race_date ? ` (${race.race_date})` : ""}`,
        String(race.total),
        String(race.received),
        String(race.unpaid),
        `${race.registeredCount}人`,
      ];
      cells.forEach((val, i) => {
        parts.push(`<text x="${summaryTextX(i)}" y="${summaryY + 20}" font-size="12" fill="#222222" text-anchor="${anchor(summaryCols[i].align)}">${escapeXml(val)}</text>`);
      });
      summaryY += rowH;
    });
  }

  let y = headH + summaryBlockH;
  const cellX = (i) => left + cols.slice(0, i).reduce((s, c) => s + c.w, 0);
  const textX = (i) => {
    const c = cols[i];
    const start = cellX(i);
    if (c.align === "end") return start + c.w - 12;
    if (c.align === "middle") return start + c.w / 2;
    return start + (c.x ?? 12);
  };

  for (const race of model.races) {
    parts.push(`<rect x="${left}" y="${y}" width="${width - 40}" height="${rowH}" fill="#1f3864"/>`);
    parts.push(`<text x="${left + 12}" y="${y + 20}" font-size="14" font-weight="700" fill="#ffffff">${escapeXml(race.race_name)}${race.race_date ? `  (${race.race_date})` : ""}</text>`);
    y += rowH;

    parts.push(`<rect x="${left}" y="${y}" width="${width - 40}" height="${rowH}" fill="#d9e1f2"/>`);
    cols.forEach((c, i) => {
      parts.push(`<text x="${textX(i)}" y="${y + 20}" font-size="12" font-weight="700" fill="#1f3864" text-anchor="${anchor(c.align)}">${escapeXml(c.label)}</text>`);
    });
    y += rowH;

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

    parts.push(`<rect x="${left}" y="${y}" width="${width - 40}" height="${rowH}" fill="#f2f2f2"/>`);
    parts.push(`<text x="${left + 12}" y="${y + 20}" font-size="12" font-weight="700" fill="#444">小計　報名金額 ${race.total}　已收 ${race.received}　未收 ${race.unpaid}　已報名 ${race.registeredCount}人</text>`);
    y += rowH;
  }

  parts.push("</svg>");
  return parts.join("\n");
}

function renderHtml(model, peopleModel) {
  const raceOptions = model.races
    .slice()
    .sort((a, b) => `${a.race_date}|${a.race_name}`.localeCompare(`${b.race_date}|${b.race_name}`, "zh-Hant"))
    .map((race) => `<option value="${escapeHtml(race.race_name)}">${escapeHtml(race.race_name)}${race.race_date ? ` (${escapeHtml(displayDate(race.race_date))})` : ""}</option>`)
    .join("\n");

  const personCards = peopleModel.people.map((person) => {
    const statusClass = person.unpaidCount > 0 ? "danger" : "success";
    const statusLabel = person.unpaidCount > 0 ? `待收 ${person.unpaidCount} 筆` : "已收齊";
    const pendingText = escapeHtml(buildNotificationText(person));
    const tableRows = person.entries.map((entry) => {
      const note = [entry.note, entry.size ? `尺寸 ${entry.size}` : ""].filter(Boolean).join("｜");
      return `
            <tr data-paid="${entry.paid ? "paid" : "unpaid"}" data-registered="${entry.registered ? "registered" : "unregistered"}" data-race="${escapeHtml(entry.race_name)}">
              <td><span class="pill ${entry.paid ? "pill-success" : "pill-danger"}">${entry.paid ? "已付" : "未付"}</span></td>
              <td class="date">${escapeHtml(displayDate(entry.race_date)) || "-"}</td>
              <td class="event-name">${escapeHtml(entry.race_name)}</td>
              <td><span class="pill ${entry.registered ? "pill-blue" : "pill-dark"}">${entry.registered ? "已報名" : "未報名"}</span></td>
              <td>${entry.paid_date ? escapeHtml(displayDate(entry.paid_date)) : "-"}</td>
              <td>${note ? escapeHtml(note) : "-"}</td>
              <td class="price">${escapeHtml(formatMoney(entry.amount))}</td>
            </tr>`;
    }).join("");

    return `
      <section
        class="runner-card"
        data-person="${escapeHtml(person.name)}"
        data-paid-state="${person.unpaidCount > 0 ? "mixed" : "paid"}"
        data-registered-state="${person.registeredCount > 0 ? "registered" : "unregistered"}"
        data-races="${escapeHtml(person.entries.map((entry) => entry.race_name).join("|"))}"
        data-keywords="${escapeHtml([person.name, person.sizeSummary, ...person.entries.map((entry) => `${entry.race_name} ${entry.note}`)].join(" ").toLowerCase())}"
        data-notification="${pendingText}"
      >
        <div class="runner-head">
          <div class="runner-name-row">
            <div class="avatar">${escapeHtml(person.name.slice(0, 1) || "?")}</div>
            <div class="runner-title">
              <h3>${escapeHtml(person.name)}</h3>
              <div class="runner-meta">
                <span class="pill pill-${statusClass}">${escapeHtml(statusLabel)}</span>
                <span class="pill pill-orange">尺寸：${escapeHtml(person.sizeSummary || "未填")}</span>
                <span class="pill pill-dark">已報名 ${person.registeredCount} / ${person.entries.length}</span>
              </div>
            </div>
          </div>
          <div class="personal-total">
            <span>個人總計 / 待收</span>
            <strong>${escapeHtml(formatMoney(person.total))}</strong>
            <small>${escapeHtml(formatMoney(person.unpaidTotal))} 尚未收到</small>
          </div>
        </div>
        <div class="person-actions">
          <button type="button" class="copy-btn" data-copy-person="${escapeHtml(person.name)}">複製此人通知</button>
        </div>
        <details class="notify-box"${person.unpaidCount > 0 ? " open" : ""}>
          <summary>通知文字預覽</summary>
          <pre>${pendingText}</pre>
        </details>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>狀態</th>
                <th>賽事日期</th>
                <th>賽事名稱</th>
                <th>報名</th>
                <th>付款日</th>
                <th>備註 / 尺寸</th>
                <th>金額</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      </section>`;
  }).join("");

  const initialNotificationList = peopleModel.people
    .filter((person) => person.unpaidCount > 0)
    .map((person) => `<button type="button" class="notify-chip" data-copy-person="${escapeHtml(person.name)}">${escapeHtml(person.name)} · ${escapeHtml(formatMoney(person.unpaidTotal))}</button>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>賽程收款明細表</title>
  <style>
    :root {
      --bg: #f3f7fb;
      --card: #ffffff;
      --primary: #154c79;
      --primary-2: #1f7a9d;
      --accent: #f59e0b;
      --danger: #e11d48;
      --success: #059669;
      --text: #1f2937;
      --muted: #6b7280;
      --line: #e5e7eb;
      --soft-blue: #eaf4fb;
      --soft-orange: #fff7ed;
      --soft-red: #fff1f2;
      --shadow: 0 16px 40px rgba(21, 76, 121, .12);
      --radius: 22px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Microsoft JhengHei", "Noto Sans TC", "PingFang TC", Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at 15% 10%, rgba(31, 122, 157, .16), transparent 34%),
        radial-gradient(circle at 90% 5%, rgba(245, 158, 11, .18), transparent 28%),
        linear-gradient(180deg, #eef7fb 0%, var(--bg) 42%, #ffffff 100%);
      padding: 30px 16px 56px;
    }
    .wrap { width: min(1280px, 100%); margin: 0 auto; }
    .hero {
      position: relative;
      overflow: hidden;
      border-radius: 30px;
      background: linear-gradient(135deg, #0f3558 0%, #166083 52%, #1f9aae 100%);
      color: white;
      padding: 34px;
      box-shadow: var(--shadow);
      margin-bottom: 20px;
    }
    .hero::after {
      content: "";
      position: absolute;
      right: -90px;
      top: -95px;
      width: 300px;
      height: 300px;
      border-radius: 50%;
      background: rgba(255,255,255,.13);
    }
    .hero::before {
      content: "PAY";
      position: absolute;
      right: 32px;
      bottom: -26px;
      font-size: 100px;
      font-weight: 900;
      letter-spacing: 8px;
      color: rgba(255,255,255,.08);
    }
    .eyebrow {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      padding: 8px 14px;
      border: 1px solid rgba(255,255,255,.28);
      border-radius: 999px;
      background: rgba(255,255,255,.12);
      backdrop-filter: blur(10px);
      font-size: 14px;
      margin-bottom: 16px;
    }
    h1 {
      position: relative;
      z-index: 1;
      margin: 0;
      font-size: clamp(28px, 4vw, 44px);
      line-height: 1.15;
    }
    .subtitle {
      position: relative;
      z-index: 1;
      margin: 12px 0 0;
      max-width: 780px;
      font-size: 16px;
      color: rgba(255,255,255,.88);
    }
    .hero-tools {
      position: relative;
      z-index: 1;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      margin-top: 18px;
      color: rgba(255,255,255,.86);
      font-size: 14px;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin: 20px 0;
    }
    .summary-card {
      background: rgba(255,255,255,.88);
      border: 1px solid rgba(255,255,255,.92);
      border-radius: 20px;
      padding: 20px 22px;
      box-shadow: 0 12px 28px rgba(31, 41, 55, .08);
      backdrop-filter: blur(12px);
    }
    .summary-label {
      color: var(--muted);
      font-size: 14px;
      margin-bottom: 8px;
    }
    .summary-value {
      font-size: 30px;
      font-weight: 900;
      color: var(--primary);
      letter-spacing: .5px;
    }
    .summary-note {
      margin-top: 8px;
      color: var(--muted);
      font-size: 13px;
      min-height: 18px;
    }
    .controls, .notice-board {
      background: var(--card);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      border: 1px solid rgba(226, 232, 240, .9);
      padding: 22px;
      margin-bottom: 20px;
    }
    .section-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin: 0 0 14px;
    }
    .section-title h2 {
      margin: 0;
      color: #17324d;
      font-size: 22px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      padding: 6px 12px;
      font-weight: 800;
      font-size: 13px;
      white-space: nowrap;
    }
    .pill-danger { background: #fff1f2; color: var(--danger); }
    .pill-success { background: #ecfdf5; color: var(--success); }
    .pill-blue { background: #e0f2fe; color: #0369a1; }
    .pill-orange { background: #fffbeb; color: #b45309; }
    .pill-dark { background: #eef2ff; color: #3730a3; }
    .filter-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 14px;
    }
    .filter-field label {
      display: block;
      margin-bottom: 8px;
      font-size: 13px;
      color: var(--muted);
      font-weight: 700;
    }
    .filter-field input, .filter-field select {
      width: 100%;
      border: 1px solid #d6dde6;
      border-radius: 14px;
      padding: 12px 14px;
      font: inherit;
      background: #fbfdff;
      color: var(--text);
    }
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 16px;
    }
    button {
      border: 0;
      border-radius: 999px;
      padding: 11px 16px;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
      background: linear-gradient(135deg, #0f3558 0%, #166083 100%);
      color: white;
      box-shadow: 0 10px 24px rgba(15, 53, 88, .16);
    }
    button.secondary {
      background: #eef6fb;
      color: #124468;
      box-shadow: none;
    }
    .notify-list {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 12px;
    }
    .notify-chip {
      background: #fff7ed;
      color: #9a3412;
      box-shadow: none;
    }
    .empty-state {
      display: none;
      margin-top: 18px;
      padding: 18px;
      border-radius: 18px;
      background: #f8fafc;
      color: #475569;
      text-align: center;
      border: 1px dashed #cbd5e1;
    }
    .runner-card {
      background: var(--card);
      border-radius: var(--radius);
      overflow: hidden;
      box-shadow: var(--shadow);
      border: 1px solid rgba(226, 232, 240, .9);
      margin-bottom: 22px;
    }
    .runner-head {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 18px;
      padding: 24px 26px 18px;
      background: linear-gradient(135deg, #ffffff 0%, #eef8fb 100%);
      border-bottom: 1px solid var(--line);
    }
    .runner-name-row {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }
    .avatar {
      width: 52px;
      height: 52px;
      border-radius: 18px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, var(--primary), var(--primary-2));
      color: white;
      font-size: 24px;
      font-weight: 900;
      box-shadow: 0 10px 22px rgba(21, 76, 121, .22);
    }
    .runner-title h3 {
      margin: 0 0 6px;
      font-size: 24px;
      color: #12263a;
    }
    .runner-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .personal-total {
      text-align: right;
      min-width: 190px;
    }
    .personal-total span, .personal-total small {
      color: var(--muted);
      font-size: 13px;
      display: block;
      margin-bottom: 4px;
    }
    .personal-total strong {
      color: var(--primary);
      font-size: 30px;
      letter-spacing: .3px;
    }
    .person-actions {
      display: flex;
      justify-content: flex-end;
      padding: 0 26px 14px;
    }
    .copy-btn {
      background: #17324d;
    }
    .notify-box {
      margin: 0 26px 18px;
      border-radius: 18px;
      background: var(--soft-orange);
      border: 1px solid #fed7aa;
      overflow: hidden;
    }
    .notify-box summary {
      cursor: pointer;
      padding: 14px 16px;
      font-weight: 800;
      color: #9a3412;
    }
    .notify-box pre {
      margin: 0;
      padding: 0 16px 16px;
      white-space: pre-wrap;
      line-height: 1.7;
      font-family: inherit;
      color: #7c2d12;
    }
    .table-wrap { overflow-x: auto; }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      min-width: 900px;
    }
    thead th {
      background: #f8fafc;
      color: #334155;
      font-size: 13px;
      text-align: left;
      padding: 14px 16px;
      border-bottom: 1px solid var(--line);
      white-space: nowrap;
    }
    tbody td {
      padding: 16px;
      border-bottom: 1px solid #eef2f7;
      vertical-align: middle;
      font-size: 14px;
    }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:hover { background: #fbfdff; }
    .date {
      font-weight: 800;
      color: #0f3558;
      white-space: nowrap;
    }
    .event-name {
      font-weight: 800;
      color: #1f2937;
      line-height: 1.45;
      min-width: 260px;
    }
    .price {
      text-align: right;
      font-weight: 900;
      color: #111827;
      white-space: nowrap;
      font-size: 15px;
    }
    .hidden { display: none !important; }
    .footer-note {
      margin-top: 18px;
      color: var(--muted);
      text-align: center;
      font-size: 13px;
    }
    @media (max-width: 1100px) {
      .filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .summary-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 900px) {
      .runner-head { grid-template-columns: 1fr; }
      .personal-total { text-align: left; }
    }
    @media (max-width: 640px) {
      body { padding: 18px 12px 34px; }
      .hero { padding: 26px 22px; border-radius: 22px; }
      .summary-grid, .filter-grid { grid-template-columns: 1fr; }
      .runner-head { padding: 20px; }
      .person-actions { padding: 0 20px 14px; }
      .notify-box { margin: 0 20px 18px; }
      .section-title { align-items: flex-start; flex-direction: column; }
    }
    @media print {
      body { background: white; padding: 0; }
      .hero, .summary-card, .controls, .notice-board, .runner-card { box-shadow: none; }
      .controls button, .notify-list, .person-actions, .footer-note { display: none !important; }
      .runner-card { page-break-inside: avoid; }
      .notify-box { border-color: #e5e7eb; background: #fafafa; }
    }
  </style>
</head>
<body>
  <main class="wrap">
    <header class="hero">
      <div class="eyebrow">Runner Payment Desk</div>
      <h1>賽程收款明細表</h1>
      <p class="subtitle">直接從收款 Excel 匯出。這版改成以人為主，可快速查人、篩未付、複製通知文字，再搭配下方卡片直接剪貼給使用者。</p>
      <div class="hero-tools">
        <span>更新日期：${escapeHtml(today)}</span>
        <span>共 ${escapeHtml(String(peopleModel.totals.personCount))} 人 / ${escapeHtml(String(peopleModel.totals.registrationCount))} 筆報名</span>
      </div>
    </header>

    <section class="summary-grid" aria-label="收款摘要">
      <div class="summary-card">
        <div class="summary-label">總金額</div>
        <div class="summary-value" id="summary-total">${escapeHtml(formatMoney(model.grandTotal))}</div>
        <div class="summary-note">全部報名費加總</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">已收金額</div>
        <div class="summary-value" id="summary-received">${escapeHtml(formatMoney(model.grandReceived))}</div>
        <div class="summary-note">目前已收到的款項</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">待收金額</div>
        <div class="summary-value" id="summary-unpaid">${escapeHtml(formatMoney(model.grandTotal - model.grandReceived))}</div>
        <div class="summary-note">所有未付款項總和</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">待通知人數</div>
        <div class="summary-value" id="summary-people">${escapeHtml(String(peopleModel.totals.unpaidPeopleCount))} 人</div>
        <div class="summary-note" id="summary-visible-note">目前顯示全部名單</div>
      </div>
    </section>

    <section class="controls">
      <div class="section-title">
        <h2>快速篩選</h2>
        <span class="pill pill-blue">先篩再複製通知</span>
      </div>
      <div class="filter-grid">
        <div class="filter-field">
          <label for="race-filter">賽事</label>
          <select id="race-filter">
            <option value="">全部賽事</option>
            ${raceOptions}
          </select>
        </div>
        <div class="filter-field">
          <label for="paid-filter">付款狀態</label>
          <select id="paid-filter">
            <option value="">全部</option>
            <option value="unpaid">只看未付</option>
            <option value="paid">只看全數已付</option>
          </select>
        </div>
        <div class="filter-field">
          <label for="registered-filter">報名狀態</label>
          <select id="registered-filter">
            <option value="">全部</option>
            <option value="registered">只看有報名</option>
            <option value="unregistered">只看未報名</option>
          </select>
        </div>
        <div class="filter-field">
          <label for="person-filter">姓名 / 備註關鍵字</label>
          <input id="person-filter" type="text" placeholder="例如：張、10K、XL、半馬" />
        </div>
        <div class="filter-field">
          <label for="sort-filter">排序</label>
          <select id="sort-filter">
            <option value="unpaid">待收金額高到低</option>
            <option value="name">姓名</option>
            <option value="total">個人總金額高到低</option>
          </select>
        </div>
      </div>
      <div class="actions">
        <button type="button" id="copy-visible">複製目前篩選結果通知</button>
        <button type="button" class="secondary" id="show-unpaid-only">一鍵只看未付</button>
        <button type="button" class="secondary" id="reset-filters">清空篩選</button>
      </div>
    </section>

    <section class="notice-board">
      <div class="section-title">
        <h2>待通知名單</h2>
        <span class="pill pill-danger" id="notify-pill">${escapeHtml(String(peopleModel.totals.unpaidPeopleCount))} 人待通知</span>
      </div>
      <div class="notify-list" id="notify-list">${initialNotificationList}</div>
    </section>

    <div id="cards-root">
      ${personCards}
    </div>

    <div class="empty-state" id="empty-state">目前篩選條件下沒有符合的人員。</div>
    <p class="footer-note">由 scripts/build-payment-sheet.mjs 自動產生。資料請回到 收款明細.xlsx 維護，再重新執行匯出。</p>
  </main>

  <script>
    const PAYMENT_DATA = ${safeJson({
      people: peopleModel.people.map((person) => ({
        name: person.name,
        total: person.total,
        unpaidTotal: person.unpaidTotal,
        unpaidCount: person.unpaidCount,
        registeredCount: person.registeredCount,
        entries: person.entries,
        notification: buildNotificationText(person),
      })),
    })};

    const root = document.getElementById("cards-root");
    const cards = Array.from(root.querySelectorAll(".runner-card"));
    const summaryTotal = document.getElementById("summary-total");
    const summaryReceived = document.getElementById("summary-received");
    const summaryUnpaid = document.getElementById("summary-unpaid");
    const summaryPeople = document.getElementById("summary-people");
    const summaryVisibleNote = document.getElementById("summary-visible-note");
    const notifyList = document.getElementById("notify-list");
    const notifyPill = document.getElementById("notify-pill");
    const emptyState = document.getElementById("empty-state");

    const filters = {
      race: document.getElementById("race-filter"),
      paid: document.getElementById("paid-filter"),
      registered: document.getElementById("registered-filter"),
      person: document.getElementById("person-filter"),
      sort: document.getElementById("sort-filter"),
    };

    function formatMoney(value) {
      return "NT$ " + Number(value || 0).toLocaleString("zh-TW");
    }

    function getPeopleData(name) {
      return PAYMENT_DATA.people.find((person) => person.name === name);
    }

    async function copyText(text) {
      await navigator.clipboard.writeText(text);
    }

    function buildBatchMessage(visibleNames) {
      const messages = visibleNames
        .map((name) => getPeopleData(name))
        .filter(Boolean)
        .map((person) => person.notification);
      return messages.join("\\n\\n----------------\\n\\n");
    }

    function updateNotifyList(visiblePeople) {
      const pending = visiblePeople.filter((person) => person.unpaidCount > 0);
      notifyPill.textContent = pending.length + " 人待通知";
      notifyList.innerHTML = pending.length
        ? pending.map((person) => '<button type="button" class="notify-chip" data-copy-person="' + person.name.replace(/"/g, "&quot;") + '">' + person.name + " · " + formatMoney(person.unpaidTotal) + '</button>').join("")
        : '<span class="pill pill-success">目前篩選結果無待通知對象</span>';
    }

    function updateSummaries(visiblePeople) {
      const total = visiblePeople.reduce((sum, person) => sum + person.total, 0);
      const unpaid = visiblePeople.reduce((sum, person) => sum + person.unpaidTotal, 0);
      const received = total - unpaid;
      const unpaidPeople = visiblePeople.filter((person) => person.unpaidCount > 0).length;
      summaryTotal.textContent = formatMoney(total);
      summaryReceived.textContent = formatMoney(received);
      summaryUnpaid.textContent = formatMoney(unpaid);
      summaryPeople.textContent = unpaidPeople + " 人";
      summaryVisibleNote.textContent = "目前顯示 " + visiblePeople.length + " 人";
    }

    function applyFilters() {
      const race = filters.race.value;
      const paid = filters.paid.value;
      const registered = filters.registered.value;
      const keyword = filters.person.value.trim().toLowerCase();

      cards.forEach((card) => {
        const personName = card.dataset.person;
        const person = getPeopleData(personName);
        const matchesRace = !race || person.entries.some((entry) => entry.race_name === race);
        const matchesPaid = !paid || (paid === "unpaid" ? person.unpaidCount > 0 : person.unpaidCount === 0);
        const matchesRegistered = !registered || (registered === "registered" ? person.registeredCount > 0 : person.registeredCount === 0);
        const matchesKeyword = !keyword || card.dataset.keywords.includes(keyword);
        const visible = matchesRace && matchesPaid && matchesRegistered && matchesKeyword;
        card.classList.toggle("hidden", !visible);
      });

      sortCards();
      const visibleNames = cards.filter((card) => !card.classList.contains("hidden")).map((card) => card.dataset.person);
      const visiblePeople = visibleNames.map((name) => getPeopleData(name)).filter(Boolean);
      updateSummaries(visiblePeople);
      updateNotifyList(visiblePeople);
      emptyState.style.display = visiblePeople.length ? "none" : "block";
      return visibleNames;
    }

    function sortCards() {
      const mode = filters.sort.value;
      const sorted = cards.slice().sort((a, b) => {
        const personA = getPeopleData(a.dataset.person);
        const personB = getPeopleData(b.dataset.person);
        if (mode === "name") return personA.name.localeCompare(personB.name, "zh-Hant");
        if (mode === "total") {
          if (personB.total !== personA.total) return personB.total - personA.total;
          return personA.name.localeCompare(personB.name, "zh-Hant");
        }
        if (personB.unpaidTotal !== personA.unpaidTotal) return personB.unpaidTotal - personA.unpaidTotal;
        return personA.name.localeCompare(personB.name, "zh-Hant");
      });
      sorted.forEach((card) => root.appendChild(card));
    }

    document.addEventListener("click", async (event) => {
      const copyTarget = event.target.closest("[data-copy-person]");
      if (copyTarget) {
        const person = getPeopleData(copyTarget.dataset.copyPerson);
        if (!person) return;
        await copyText(person.notification);
        copyTarget.textContent = "已複製";
        setTimeout(() => {
          copyTarget.textContent = copyTarget.classList.contains("notify-chip")
            ? person.name + " · " + formatMoney(person.unpaidTotal)
            : "複製此人通知";
        }, 1200);
      }
    });

    document.getElementById("copy-visible").addEventListener("click", async () => {
      const visibleNames = applyFilters();
      await copyText(buildBatchMessage(visibleNames));
      const button = document.getElementById("copy-visible");
      button.textContent = "已複製目前篩選結果";
      setTimeout(() => { button.textContent = "複製目前篩選結果通知"; }, 1200);
    });

    document.getElementById("show-unpaid-only").addEventListener("click", () => {
      filters.paid.value = "unpaid";
      applyFilters();
    });

    document.getElementById("reset-filters").addEventListener("click", () => {
      filters.race.value = "";
      filters.paid.value = "";
      filters.registered.value = "";
      filters.person.value = "";
      filters.sort.value = "unpaid";
      applyFilters();
    });

    Object.values(filters).forEach((element) => {
      element.addEventListener("input", applyFilters);
      element.addEventListener("change", applyFilters);
    });

    applyFilters();
  </script>
</body>
</html>`;
}

const source = (await readXlsxSource(paths.xlsx)) ?? (await readJson(paths.source, { races: [] }));
const database = await readJson(paths.database, []);
const model = buildModel(source, buildRaceIndex(database));
const peopleModel = buildPeopleModel(model);

await writeFile(paths.md, renderMarkdown(model), "utf-8");
await writeFile(paths.svg, renderSvg(model), "utf-8");
await writeFile(paths.html, renderHtml(model, peopleModel), "utf-8");

console.log(`產出 ${model.races.length} 場 / ${peopleModel.totals.personCount} 人 → md / svg / html。總計已收 ${model.grandReceived} / 總金額 ${model.grandTotal}。`);
