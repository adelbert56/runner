const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const Module = require("node:module");

const runtimeNodeModules = path.resolve(process.execPath, "..", "..", "node_modules");
const runtimePnpmNodeModules = path.join(runtimeNodeModules, ".pnpm", "node_modules");
const extraModulePaths = [runtimeNodeModules, runtimePnpmNodeModules].filter((target, index, list) => {
  return list.indexOf(target) === index;
});

process.env.NODE_PATH = [process.env.NODE_PATH, ...extraModulePaths].filter(Boolean).join(";");
Module.Module._initPaths();

const { chromium } = require("playwright");

const defaultInput = path.resolve(
  "D:/Users/Squall/Documents/Runner/半馬重建訓練計畫_進階互動版_v7_最終收尾版.html"
);
const defaultOutput = path.resolve(
  "D:/Users/Squall/Documents/20 週半馬重建訓練計畫｜手冊匯出版.pdf"
);

function getArg(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function resolveBrowserPath() {
  const candidates = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe"
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }

  throw new Error("找不到可用的 Chrome 或 Edge。");
}

async function waitForAssets(page) {
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const nextFrame = () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    document.documentElement.classList.add("pdf-exporting");

    const images = Array.from(document.images);
    for (const img of images) {
      img.loading = "eager";
      img.decoding = "sync";
      img.setAttribute("fetchpriority", "high");
      img.scrollIntoView({ block: "center" });
      await sleep(30);
    }
    window.scrollTo(0, 0);

    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    await Promise.all(
      images.map(async (img) => {
        if (!img.complete || img.naturalWidth === 0 || img.naturalHeight === 0) {
          await new Promise((resolve) => {
            let settled = false;
            const done = () => {
              if (!settled) {
                settled = true;
                resolve();
              }
            };
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
            setTimeout(done, 8000);
          });
        }
        if (img.decode) {
          try {
            await img.decode();
          } catch {}
        }
      })
    );

    await nextFrame();
    await sleep(300);
  });

  await page.waitForFunction(
    () =>
      Array.from(document.images).every(
        (img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0
      ),
    null,
    { timeout: 15000 }
  );
}

async function main() {
  const inputPath = path.resolve(getArg("--input") || defaultInput);
  const outputPath = path.resolve(getArg("--output") || defaultOutput);
  const browserPath = await resolveBrowserPath();

  await fs.access(inputPath);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: browserPath
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 2200 },
      deviceScaleFactor: 1.5
    });

    await page.goto(`${pathToFileURL(inputPath).href}?print=1&ts=${Date.now()}`, {
      waitUntil: "networkidle"
    });
    await page.emulateMedia({ media: "print" });
    await waitForAssets(page);

    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      displayHeaderFooter: false,
      preferCSSPageSize: true,
      margin: {
        top: "10mm",
        right: "10mm",
        bottom: "12mm",
        left: "10mm"
      }
    });

    console.log(`PDF 已輸出：${outputPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`匯出失敗：${error.message}`);
  process.exitCode = 1;
});
