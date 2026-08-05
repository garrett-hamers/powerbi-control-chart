import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import { capturePage, findBrowser, launchBrowser } from "./browser.mjs";

/**
 * One-off render probe: loads the packaged visual with its packaged CSS applied and
 * measures what the stylesheet actually does - overflow against the clipped bounds,
 * focus behaviour, selection, and keyboard navigation.
 */

const root = process.cwd();
const toolsDirectory = path.join(root, "tools", "screenshots");
const temporaryDirectory = path.join(root, ".tmp", "probe");
const WIDTH = 1366;
const HEIGHT = 768;

const PROBE = `(async () => {
  const root = document.documentElement;
  if (root.dataset.harnessReady !== "true") {
    return { ready: false };
  }
  const host = document.getElementById("visual");
  const visual = host.querySelector(".atlyn-control-chart");
  const hostBox = host.getBoundingClientRect();

  const style = getComputedStyle(visual);
  const cssApplied = {
    display: style.display,
    flexDirection: style.flexDirection,
    overflow: style.overflow,
    fontFamily: style.fontFamily.slice(0, 30),
    background: style.backgroundColor,
    inkVar: style.getPropertyValue("--atlyn-ink").trim()
  };

  const overflowing = [];
  for (const node of visual.querySelectorAll("*")) {
    const box = node.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    const over = {
      bottom: Math.round(box.bottom - hostBox.bottom),
      right: Math.round(box.right - hostBox.right),
      top: Math.round(hostBox.top - box.top),
      left: Math.round(hostBox.left - box.left)
    };
    const worst = Math.max(over.bottom, over.right, over.top, over.left);
    if (worst > 1) {
      overflowing.push({
        tag: node.tagName.toLowerCase(),
        cls: (node.getAttribute("class") || "").slice(0, 40),
        over
      });
    }
  }

  const scrollers = [...visual.querySelectorAll("*")]
    .filter((n) => n.scrollHeight - n.clientHeight > 1 || n.scrollWidth - n.clientWidth > 1)
    .map((n) => ({
      cls: (n.getAttribute("class") || "").slice(0, 40),
      overflowY: getComputedStyle(n).overflowY,
      hiddenPx: n.scrollHeight - n.clientHeight
    }));

  // Focus the first keyboard-reachable point and see what the stylesheet does.
  const first = visual.querySelector('circle.atlyn-point[tabindex="0"]');
  let focus = { found: false };
  if (first) {
    const beforeScroll = { x: host.scrollLeft, y: host.scrollTop, docY: window.scrollY };
    first.focus();
    const active = document.activeElement;
    const outline = getComputedStyle(first);
    const box = first.getBoundingClientRect();
    focus = {
      found: true,
      isActive: active === first,
      outlineWidth: outline.outlineWidth,
      outlineStyle: outline.outlineStyle,
      strokeWidth: outline.strokeWidth,
      scrolledHost: host.scrollTop !== beforeScroll.y || host.scrollLeft !== beforeScroll.x,
      scrolledWindow: window.scrollY !== beforeScroll.docY,
      insideBounds: box.top >= hostBox.top - 1 && box.bottom <= hostBox.bottom + 1
    };
  }

  // Keyboard navigation: ArrowRight should move focus to the next point.
  let keyboard = { moved: false };
  if (first) {
    const before = document.activeElement;
    visual.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    keyboard = {
      moved: document.activeElement !== before,
      activeTag: document.activeElement ? document.activeElement.tagName.toLowerCase() : null,
      activeKey: document.activeElement ? document.activeElement.getAttribute("data-point-key") : null
    };
  }

  // Selection: a real click should apply the selected class the stylesheet targets.
  let selection = { clicked: false };
  const target = visual.querySelector("circle.atlyn-point");
  if (target) {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 60));
    const selected = visual.querySelectorAll("circle.atlyn-point.is-selected");
    selection = {
      clicked: true,
      selectedCount: selected.length,
      selectedStroke: selected[0] ? getComputedStyle(selected[0]).stroke : null,
      dimmedCount: visual.querySelectorAll(".is-dimmed").length
    };
  }

  // Focus the LAST alarm row - the one clipped below the panel's visible area. Focusing a
  // clipped descendant must scroll the overflow:auto panel, and must NOT scroll the
  // overflow:hidden root, which has no scrollbar and could never be scrolled back.
  let clippedRow = { found: false };
  const rows = visual.querySelectorAll("tr.atlyn-alarm-row");
  const panel = visual.querySelector(".atlyn-alarm-panel");
  if (rows.length > 0 && panel) {
    const last = rows[rows.length - 1];
    const beforeRootScroll = { top: visual.scrollTop, left: visual.scrollLeft };
    const headerBefore = visual.querySelector(".atlyn-header").getBoundingClientRect().top;
    last.focus();
    await new Promise((r) => setTimeout(r, 80));
    const panelBox = panel.getBoundingClientRect();
    const rowBox = last.getBoundingClientRect();
    const headerAfter = visual.querySelector(".atlyn-header").getBoundingClientRect().top;
    clippedRow = {
      found: true,
      rowCount: rows.length,
      isActive: document.activeElement === last,
      panelScrolled: panel.scrollTop > 0,
      panelScrollTop: panel.scrollTop,
      rowVisibleInPanel: rowBox.top >= panelBox.top - 1 && rowBox.bottom <= panelBox.bottom + 1,
      rowInsideHost: rowBox.top >= hostBox.top - 1 && rowBox.bottom <= hostBox.bottom + 1,
      rootScrolled: visual.scrollTop !== beforeRootScroll.top || visual.scrollLeft !== beforeRootScroll.left,
      rootScrollTop: visual.scrollTop,
      headerMovedPx: Math.round(headerAfter - headerBefore),
      outlineWidth: getComputedStyle(last).outlineWidth
    };
    panel.scrollTop = 0;
  }

  // Reduced motion rules are class-driven; confirm they resolve when the class is on.
  visual.classList.add("reduced-motion");
  const rm = getComputedStyle(visual.querySelector("circle.atlyn-point"));
  const reducedMotion = { transitionDuration: rm.transitionDuration, animationDuration: rm.animationDuration };
  visual.classList.remove("reduced-motion");

  // High contrast is also class-driven.
  visual.classList.add("high-contrast");
  const hc = getComputedStyle(visual);
  const highContrast = { ink: hc.getPropertyValue("--atlyn-ink").trim() };
  visual.classList.remove("high-contrast");

  return {
    ready: true,
    scene: root.dataset.harnessScene,
    hostBox: { w: Math.round(hostBox.width), h: Math.round(hostBox.height) },
    cssApplied,
    overflowing,
    scrollers,
    focus,
    clippedRow,
    keyboard,
    selection,
    reducedMotion,
    highContrast
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

const noStylePath = path.join(temporaryDirectory, "empty.css");
writeFileSync(noStylePath, "", "utf8");

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
    ["/empty.css", noStylePath],
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
const profileDirectory = mkdtempSync(path.join(os.tmpdir(), "atlyn-probe-"));
const browser = await launchBrowser(browserPath, profileDirectory, [`--window-size=${WIDTH},${HEIGHT}`]);

const { SCENES } = await import(pathToFileURL(path.join(toolsDirectory, "scenes.mjs")).href);

try {
    for (const scene of SCENES) {
        const { state } = await capturePage(browser, {
            url: `http://127.0.0.1:${port}/harness.html?scene=${scene.id}`,
            width: WIDTH,
            height: HEIGHT,
            readyExpression: PROBE
        });
        process.stdout.write(`\n===== ${scene.id} =====\n`);
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
