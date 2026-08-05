import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import { capturePage, findBrowser, launchBrowser } from "./browser.mjs";
import { cropOrPadPng, readPngHeader } from "./png-utils.mjs";

/**
 * Captures the AppSource listing screenshots from the *packaged* visual.
 *
 * Pipeline: `npm run package` -> extract the bundled JavaScript and CSS out of the PBIVIZ ->
 * serve the offline harness on loopback -> render each scene over the DevTools Protocol at
 * exactly 1366x768 -> verify the emitted PNGs.
 *
 * Nothing here draws chart output; every pixel of the chart comes from the real built
 * visual. If no browser can be resolved, or a scene fails to render, the script fails loudly
 * rather than producing a placeholder image.
 */

const SCREENSHOT_WIDTH = 1366;
const SCREENSHOT_HEIGHT = 768;
const MAX_SCREENSHOT_BYTES = 1024 * 1024;

const READY_EXPRESSION = `(() => {
  const root = document.documentElement;
  return {
    ready: root.dataset.harnessReady === "true",
    error: root.dataset.harnessError,
    scene: root.dataset.harnessScene,
    points: document.querySelectorAll("#visual svg.atlyn-chart circle.atlyn-point").length,
    alarmPoints: document.querySelectorAll("#visual svg.atlyn-chart circle.atlyn-point.is-alarm").length,
    centerlines: document.querySelectorAll("#visual svg.atlyn-chart path.atlyn-centerline").length,
    bands: document.querySelectorAll("#visual svg.atlyn-chart path.atlyn-band").length,
    alarmRows: document.querySelectorAll("#visual .atlyn-alarm-table tbody tr").length,
    status: document.querySelector("#visual .atlyn-status")?.textContent ?? ""
  };
})()`;

const root = process.cwd();
const toolsDirectory = path.join(root, "tools", "screenshots");
const outputDirectory = path.join(root, "assets", "screenshots");
const temporaryDirectory = path.join(root, ".tmp", "screenshots");
const skipPackage = process.argv.includes("--skip-package");

const { SCENES } = await import(pathToFileURL(path.join(toolsDirectory, "scenes.mjs")).href);

const ensure = (condition, message) => {
    if (!condition) {
        throw new Error(message);
    }
};

const runNpm = (script) => {
    const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
    const commandArguments = process.platform === "win32"
        ? ["/d", "/s", "/c", `npm.cmd run ${script}`]
        : ["run", script];
    const result = spawnSync(command, commandArguments, {
        cwd: root,
        stdio: "inherit",
        shell: false,
        windowsHide: true
    });
    if (result.error) {
        throw result.error;
    }
    ensure(result.status === 0, `npm run ${script} failed with exit code ${result.status}.`);
};

const extractBundle = async () => {
    const manifest = JSON.parse(readFileSync(path.join(root, "pbiviz.json"), "utf8"));
    const artifactName = `${manifest.visual.guid}.${manifest.visual.version}.pbiviz`;
    const artifactPath = path.join(root, "dist", artifactName);
    ensure(
        existsSync(artifactPath),
        `Missing packaged visual at dist/${artifactName}. Run \`npm run package\` first.`
    );

    const archive = await JSZip.loadAsync(readFileSync(artifactPath));
    const resourceName = `resources/${manifest.visual.guid}.pbiviz.json`;
    const resource = archive.file(resourceName);
    ensure(resource, `Packaged visual is missing ${resourceName}.`);

    const packaged = JSON.parse(await resource.async("string"));
    const bundle = packaged?.content?.js;
    ensure(typeof bundle === "string" && bundle.length > 0, "Packaged visual contains no JavaScript bundle.");
    const style = packaged?.content?.css ?? "";
    ensure(
        style.length > 0,
        "Packaged visual contains no compiled CSS. `src/visual.ts` must import "
        + "`./../style/visual.less` so MiniCssExtractPlugin emits it."
    );

    mkdirSync(temporaryDirectory, { recursive: true });
    const bundlePath = path.join(temporaryDirectory, "visual.js");
    const stylePath = path.join(temporaryDirectory, "visual.css");
    writeFileSync(bundlePath, bundle, "utf8");
    writeFileSync(stylePath, style, "utf8");
    return {
        artifactName,
        bundlePath,
        stylePath,
        bundleBytes: Buffer.byteLength(bundle),
        styleBytes: Buffer.byteLength(style)
    };
};

const CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".css": "text/css; charset=utf-8"
};

const startServer = (bundlePath, stylePath) => new Promise((resolve) => {
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

    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
});

const finalize = (buffer, sceneId, outputPath) => {
    let normalized = buffer;
    let header = readPngHeader(normalized);
    if (header.width !== SCREENSHOT_WIDTH || header.height !== SCREENSHOT_HEIGHT) {
        process.stderr.write(
            `  ! ${sceneId}: browser emitted ${header.width}x${header.height}; normalizing to `
            + `${SCREENSHOT_WIDTH}x${SCREENSHOT_HEIGHT}.\n`
        );
        normalized = cropOrPadPng(normalized, SCREENSHOT_WIDTH, SCREENSHOT_HEIGHT);
        header = readPngHeader(normalized);
    }
    ensure(
        header.width === SCREENSHOT_WIDTH && header.height === SCREENSHOT_HEIGHT,
        `${sceneId}: expected ${SCREENSHOT_WIDTH}x${SCREENSHOT_HEIGHT}, got ${header.width}x${header.height}.`
    );
    ensure(
        normalized.length <= MAX_SCREENSHOT_BYTES,
        `${sceneId}: ${normalized.length} bytes exceeds the ${MAX_SCREENSHOT_BYTES} byte AppSource limit.`
    );
    writeFileSync(outputPath, normalized);
    return {
        bytes: normalized.length,
        sha256: createHash("sha256").update(normalized).digest("hex")
    };
};

if (!skipPackage) {
    runNpm("package");
}

const browserPath = findBrowser();
const { artifactName, bundlePath, stylePath, bundleBytes, styleBytes } = await extractBundle();
const { server, port } = await startServer(bundlePath, stylePath);
const profileDirectory = mkdtempSync(path.join(os.tmpdir(), "atlyn-screenshot-"));

process.stdout.write(`Browser: ${browserPath}\n`);
process.stdout.write(
    `Bundle:  ${artifactName} (${bundleBytes} bytes of JavaScript, ${styleBytes} bytes of CSS)\n`
);
process.stdout.write(`Harness: http://127.0.0.1:${port}/harness.html\n`);

const browser = await launchBrowser(browserPath, profileDirectory, [
    `--window-size=${SCREENSHOT_WIDTH},${SCREENSHOT_HEIGHT}`
]);

try {
    mkdirSync(outputDirectory, { recursive: true });
    for (const scene of SCENES) {
        const outputPath = path.join(outputDirectory, `${scene.id}.png`);
        const url = `http://127.0.0.1:${port}/harness.html?scene=${scene.id}`;
        const { buffer, state } = await capturePage(browser, {
            url,
            width: SCREENSHOT_WIDTH,
            height: SCREENSHOT_HEIGHT,
            readyExpression: READY_EXPRESSION
        });
        ensure(state.scene === scene.id, `Harness rendered "${state.scene}" instead of "${scene.id}".`);
        ensure(state.points > 0, `Scene ${scene.id} rendered no control chart points.`);
        ensure(state.centerlines > 0, `Scene ${scene.id} rendered no centre line.`);
        if (scene.expectAlarms) {
            ensure(
                state.alarmPoints > 0,
                `Scene ${scene.id} rendered no out-of-control point; the screenshot would not show a signal.`
            );
        }
        if (scene.expectAlarmTable) {
            ensure(state.alarmRows > 0, `Scene ${scene.id} rendered an empty alarm table.`);
        } else {
            ensure(state.alarmRows === 0, `Scene ${scene.id} rendered an alarm table it was meant to hide.`);
        }
        const { bytes, sha256 } = finalize(buffer, scene.id, outputPath);
        process.stdout.write(
            `  ${scene.id}.png  ${SCREENSHOT_WIDTH}x${SCREENSHOT_HEIGHT}  ${bytes} bytes  `
            + `${state.points} points, ${state.alarmPoints} flagged, ${state.alarmRows} alarm rows  `
            + `sha256=${sha256}\n`
        );
    }
} finally {
    await browser.close();
    server.close();
    try {
        rmSync(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
        // The browser can hold locks on Windows briefly; a leftover temp profile is harmless.
    }
}

process.stdout.write(`Captured ${SCENES.length} screenshot(s) into assets/screenshots.\n`);
