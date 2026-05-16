import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import http from "node:http";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const port = Number(process.env.UI_LAYOUT_PORT || 4174);
const baseUrl = `http://127.0.0.1:${port}/site/`;
const screenshotDir = resolve(root, "output/playwright");

const panels = [
  { id: "races", label: "賽事" },
  { id: "gear", label: "跑鞋" },
  { id: "academy", label: "入門" },
  { id: "training", label: "練跑" },
  { id: "news", label: "新聞" },
];

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 },
];

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    fail(
      "Playwright is not installed. Run `npm install --no-save playwright@1.56.1` and `npx playwright install chromium` first."
    );
  }
}

function waitForServer(url, timeoutMs = 10000) {
  const started = Date.now();
  return new Promise((resolveReady, rejectReady) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolveReady();
          return;
        }
        retry();
      });
      req.on("error", retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        rejectReady(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(check, 250);
    };

    check();
  });
}

function startServer() {
  const child = spawn(process.execPath, ["site/server.mjs"], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

async function assertNoHorizontalOverflow(page, context) {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  if (metrics.scroll > metrics.viewport + 2) {
    throw new Error(`${context}: horizontal overflow ${metrics.scroll}px > ${metrics.viewport}px`);
  }
}

async function assertTextFitsControls(page, context) {
  const offenders = await page.evaluate(() => {
    const selectors = [
      "button",
      ".button",
      ".register-link",
      ".link-button",
      ".toggle-button",
      ".race-card h3",
      ".shoe-release-list article h3",
      ".news-list article h3",
    ];
    return [...document.querySelectorAll(selectors.join(","))]
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          element.scrollWidth > element.clientWidth + 2
        );
      })
      .slice(0, 8)
      .map((element) => ({
        selector: element.tagName.toLowerCase(),
        className: element.className || "",
        text: (element.textContent || "").trim().slice(0, 80),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
  });

  if (offenders.length) {
    throw new Error(`${context}: text overflow ${JSON.stringify(offenders)}`);
  }
}

async function assertRaceCardsStayScannable(page, viewportName) {
  const limits = viewportName === "desktop" ? { titleLines: 3, cardHeight: 430 } : { titleLines: 4, cardHeight: 560 };
  const cards = await page.evaluate((limitsArg) => {
    return [...document.querySelectorAll(".race-card")]
      .slice(0, 6)
      .map((card) => {
        const title = card.querySelector("h3");
        const titleStyle = title ? window.getComputedStyle(title) : null;
        const lineHeight = titleStyle ? parseFloat(titleStyle.lineHeight) || 24 : 24;
        const titleLines = title ? Math.round(title.getBoundingClientRect().height / lineHeight) : 0;
        return {
          title: (title?.textContent || "").trim(),
          titleLines,
          height: Math.round(card.getBoundingClientRect().height),
          titleOk: titleLines <= limitsArg.titleLines,
          heightOk: card.getBoundingClientRect().height <= limitsArg.cardHeight,
        };
      });
  }, limits);

  const badCards = cards.filter((card) => !card.titleOk || !card.heightOk);
  if (badCards.length) {
    throw new Error(`${viewportName}: race cards are too dense ${JSON.stringify(badCards)}`);
  }
}

async function assertPanel(page, panel, viewportName) {
  await page.click(`[data-panel-link="${panel.id}"]`);
  await page.waitForSelector(`#${panel.id}.active`, { timeout: 5000 });
  await page.waitForLoadState("networkidle");

  const visible = await page.locator(`#${panel.id}`).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 240;
  });
  if (!visible) {
    throw new Error(`${viewportName}/${panel.id}: panel is not visibly rendered`);
  }

  await assertNoHorizontalOverflow(page, `${viewportName}/${panel.id}`);
  await assertTextFitsControls(page, `${viewportName}/${panel.id}`);

  if (panel.id === "races") {
    await page.waitForSelector(".race-card", { timeout: 5000 });
    await assertRaceCardsStayScannable(page, viewportName);
  }

  await page.screenshot({
    path: resolve(screenshotDir, `${viewportName}-${panel.id}.png`),
    fullPage: true,
  });
  console.log(`OK ${viewportName}/${panel.id} layout`);
}

const { chromium } = await loadPlaywright();
await mkdir(screenshotDir, { recursive: true });

const server = startServer();
let browser;

try {
  await waitForServer(baseUrl);
  browser = await chromium.launch({ headless: true });

  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (error) => fail(`${viewport.name}: page error: ${error.message}`));
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    for (const panel of panels) {
      await assertPanel(page, panel, viewport.name);
    }

    await page.close();
  }
} catch (error) {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
} finally {
  if (browser) {
    await browser.close();
  }
  server.kill();
}
