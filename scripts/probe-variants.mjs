import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { capturePage, findBrowser, launchBrowser } from "./browser.mjs";

/**
 * Render probe for the host variants the stylesheet targets but the listing screenshots do
 * not cover: high contrast, RTL, and a small viewport. Reports computed values rather than
 * asserting, so the results can be read and judged.
 */

const root = process.cwd();
const toolsDirectory = path.join(root, "tools", "screenshots");
const temporaryDirectory = path.join(root, ".tmp", "probe");

const VARIANTS = [
    { id: "baseline", query: "", width: 1366, height: 768 },
    { id: "high-contrast", query: "&hc=1", width: 1366, height: 768 },
    { id: "rtl-ar-SA", query: "&locale=ar-SA", width: 1366, height: 768 },
    { id: "rtl-high-contrast", query: "&locale=ar-SA&hc=1", width: 1366, height: 768 },
    // The visual switches to a compact layout below 420px wide; these force that branch.
    { id: "stage-400x300", query: "&w=400&h=300", width: 1366, height: 768 },
    { id: "stage-260x200", query: "&w=260&h=200", width: 1366, height: 768 },
    // The harness stage has a 1px border, so add 2px to land the content box exactly on the
    // visual's declared 180x140 minimum rather than 2px below it.
    { id: "stage-min-180x140", query: "&w=182&h=142", width: 1366, height: 768 },
    { id: "stage-below-min", query: "&w=140&h=110", width: 1366, height: 768 }
];

const PROBE = `(() => {
  const root = document.documentElement;
  if (root.dataset.harnessReady !== "true") {
    return { ready: false, error: root.dataset.harnessError };
  }
  const host = document.getElementById("visual");
  const visual = host.querySelector(".atlyn-control-chart");
  const hostBox = host.getBoundingClientRect();
  const style = getComputedStyle(visual);

  const escaped = [];
  for (const node of visual.querySelectorAll("*")) {
    const box = node.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    // Only count nodes that escape the visual's own clipped root, and are not inside a
    // scrollable panel that can bring them back into view.
    let scrollable = false;
    for (let p = node.parentElement; p && p !== visual.parentElement; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if (o === "auto" || o === "scroll") { scrollable = true; break; }
    }
    if (scrollable) continue;
    const past = Math.max(
      box.bottom - hostBox.bottom,
      box.right - hostBox.right,
      hostBox.top - box.top,
      hostBox.left - box.left
    );
    if (past > 1) {
      escaped.push({ cls: (node.getAttribute("class") || node.tagName).slice(0, 40), past: Math.round(past) });
    }
  }

  const point = visual.querySelector("circle.atlyn-point");
  const centerline = visual.querySelector("path.atlyn-centerline");
  const alarmRow = visual.querySelector("tr.atlyn-alarm-row");

  return {
    ready: true,
    dir: visual.getAttribute("dir"),
    classes: visual.className,
    hostBox: { w: Math.round(hostBox.width), h: Math.round(hostBox.height) },
    vars: {
      ink: style.getPropertyValue("--atlyn-ink").trim(),
      surface: style.getPropertyValue("--atlyn-surface").trim(),
      selected: style.getPropertyValue("--atlyn-selected").trim()
    },
    computed: {
      color: style.color,
      background: style.backgroundColor,
      overflow: style.overflow
    },
    pointStroke: point ? getComputedStyle(point).stroke : null,
    pointFill: point ? getComputedStyle(point).fill : null,
    centerlineStroke: centerline ? getComputedStyle(centerline).stroke : null,
    alarmRowColor: alarmRow ? getComputedStyle(alarmRow).color : null,
    counts: {
      points: visual.querySelectorAll("circle.atlyn-point").length,
      alarmRows: visual.querySelectorAll("tr.atlyn-alarm-row").length,
      axisLabels: visual.querySelectorAll("text.atlyn-axis-label").length
    },
    escaped,
    children: [...visual.children].map((n) => {
      const box = n.getBoundingClientRect();
      const s = getComputedStyle(n);
      return {
        cls: n.className,
        h: Math.round(box.height),
        top: Math.round(box.top - hostBox.top),
        flex: s.flexGrow + " " + s.flexShrink + " " + s.flexBasis,
        minH: s.minHeight,
        maxH: s.maxHeight,
        visible: box.bottom <= hostBox.bottom + 1
      };
    }),
    textOverflowing: [...visual.querySelectorAll(".atlyn-status, .atlyn-title, .atlyn-summary")]
      .map((n) => ({
        cls: n.className,
        clipped: n.scrollWidth - n.clientWidth > 1 || n.scrollHeight - n.clientHeight > 1,
        hiddenPx: Math.max(n.scrollWidth - n.clientWidth, n.scrollHeight - n.clientHeight)
      }))
      .filter((n) => n.clipped)
  };
})()`;

const ensure = (condition, message) => {
    if (!condition) {
        throw new Error(message);
    }
};

const manifest = JSON.parse(readFileSync(path.join(root, "pbiviz.json"), "utf8"));
const artifact = path.join(root, "dist", `${manifest.visual.guid}.${manifest.visual.version}.pbiviz`);
ensure(existsSync(artifact), `missing ${artifact}`);
const archive = await JSZip.loadAsync(readFileSync(artifact));
const packaged = JSON.parse(await archive.file(`resources/${manifest.visual.guid}.pbiviz.json`).async("string"));
mkdirSync(temporaryDirectory, { recursive: true });
const bundlePath = path.join(temporaryDirectory, "visual.js");
const stylePath = path.join(temporaryDirectory, "visual.css");
writeFileSync(bundlePath, packaged.content.js, "utf8");
writeFileSync(stylePath, packaged.content.css ?? "", "utf8");

const CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".css": "text/css; charset=utf-8"
};

const routes = new Map([
    ["/harness.html", path.join(toolsDirectory, "harness.html")],
    ["/harness.mjs", path.join(toolsDirectory, "harness.mjs")],
    ["/scenes.mjs", path.join(toolsDirectory, "scenes.mjs")],
    ["/sample-data.mjs", path.join(toolsDirectory, "sample-data.mjs")],
    ["/visual.js", bundlePath],
    ["/visual.css", stylePath],
    ["/assets/logo-300x300.png", path.join(root, "assets", "logo-300x300.png")]
]);

const server = createServer((request, response) => {
    const requestPath = new URL(request.url, "http://127.0.0.1").pathname;
    const filePath = routes.get(requestPath);
    if (!filePath || !existsSync(filePath)) {
        response.writeHead(404).end("Not found");
        return;
    }
    response.writeHead(200, {
        "content-type": CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream",
        "cache-control": "no-store"
    });
    response.end(readFileSync(filePath));
});
const port = await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});

const browserPath = findBrowser();
const profileDirectory = mkdtempSync(path.join(os.tmpdir(), "atlyn-variant-"));
const browser = await launchBrowser(browserPath, profileDirectory, ["--window-size=1366,768"]);
const scene = "02-rule-violations-and-alarm-table";

try {
    for (const variant of VARIANTS) {
        const { state } = await capturePage(browser, {
            url: `http://127.0.0.1:${port}/harness.html?scene=${scene}${variant.query}`,
            width: variant.width,
            height: variant.height,
            readyExpression: PROBE
        });
        process.stdout.write(`\n===== ${variant.id} (${variant.width}x${variant.height}) =====\n`);
        process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
    }
} finally {
    await browser.close();
    server.close();
    try {
        rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
        // Windows can hold the profile briefly.
    }
}
