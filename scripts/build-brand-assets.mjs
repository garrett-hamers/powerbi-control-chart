import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { decodePng, encodePng } from "./png-utils.mjs";

/**
 * The single generator for every Atlyn Control Chart brand asset.
 *
 * Two different, independently required images come out of one motif:
 *
 *   - `assets/icon.png` at exactly **20x20**. This is the in-product icon shown in the
 *     Power BI visualization pane and is documented as "a PNG file with dimensions 20
 *     pixels by 20 pixels":
 *     https://learn.microsoft.com/en-us/power-bi/developer/visuals/visual-project-structure
 *   - `assets/logo-300x300.png` at exactly **300x300**, the Partner Center listing logo:
 *     https://learn.microsoft.com/en-us/power-bi/developer/visuals/office-store
 *
 * They are not interchangeable, and this repository previously shipped a 300x300 image as
 * `assets/icon.png` with the audit enforcing that wrong size. Both contracts are now
 * asserted separately by `scripts/certification-audit.mjs` and
 * `scripts/audit-submission-assets.mjs`.
 *
 * The rasteriser is pure Node: an analytic scene of rounded rectangles, capsules, and
 * circles, supersampled 4x4 and composited source-over. No browser, no npm dependency, and
 * the RGBA output is bit-identical on every platform, so the audits can diff the committed
 * pixels against a fresh render and fail on any drift.
 *
 * `assets/icon.svg` is emitted from the same scene so the vector source can never drift
 * from the rasters.
 */

const VIEWBOX = 64;
const SUPERSAMPLE = 4;

export const ICON_SIZE = 20;
export const LOGO_SIZE = 300;

const INK = "#0F172A";
const LIMIT = "#38BDF8";
const CENTER = "#F8FAFC";
const TREND = "#94A3B8";
const ALARM = "#FB7185";

/**
 * A statistical process control motif, drawn in a 64x64 unit space: a centre line between
 * two control limits, a short run of points, and one point above the upper control limit.
 * Deliberately sparse - at 20 pixels anything finer than this is unreadable.
 *
 * Every horizontal line and point centre is placed on a 20-pixel *pixel centre*
 * (`(row + 0.5) * 64 / 20`) and every line is at least one 20-pixel unit thick, so the
 * small icon resolves to crisp rows instead of two half-covered antialiased ones.
 */
export const SCENE = [
    { kind: "rect", x: 0, y: 0, width: VIEWBOX, height: VIEWBOX, radius: 12, fill: INK, alpha: 1 },
    { kind: "capsule", x1: 8, y1: 14.4, x2: 56, y2: 14.4, thickness: 3.2, fill: LIMIT, alpha: 1 },
    { kind: "capsule", x1: 8, y1: 52.8, x2: 56, y2: 52.8, thickness: 3.2, fill: LIMIT, alpha: 1 },
    { kind: "capsule", x1: 8, y1: 33.6, x2: 56, y2: 33.6, thickness: 3.6, fill: CENTER, alpha: 1 },
    { kind: "capsule", x1: 17.6, y1: 40, x2: 30.4, y2: 27.2, thickness: 2.2, fill: TREND, alpha: 0.8 },
    { kind: "capsule", x1: 30.4, y1: 27.2, x2: 46.4, y2: 11.2, thickness: 2.2, fill: TREND, alpha: 0.8 },
    { kind: "circle", cx: 17.6, cy: 40, radius: 4.6, fill: LIMIT, alpha: 1 },
    { kind: "circle", cx: 30.4, cy: 27.2, radius: 4.6, fill: LIMIT, alpha: 1 },
    { kind: "circle", cx: 46.4, cy: 11.2, radius: 5.4, fill: ALARM, alpha: 1 }
];

const parseColor = (hex) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16)
];

/** Squared distance from (x, y) to the segment (x1, y1)-(x2, y2). */
function distanceToSegment(x, y, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    let t = lengthSquared === 0 ? 0 : ((x - x1) * dx + (y - y1) * dy) / lengthSquared;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = x1 + t * dx - x;
    const py = y1 + t * dy - y;
    return px * px + py * py;
}

function insideShape(shape, x, y) {
    if (shape.kind === "circle") {
        const dx = x - shape.cx;
        const dy = y - shape.cy;
        return dx * dx + dy * dy <= shape.radius * shape.radius;
    }
    if (shape.kind === "capsule") {
        const half = shape.thickness / 2;
        return distanceToSegment(x, y, shape.x1, shape.y1, shape.x2, shape.y2) <= half * half;
    }
    const left = shape.x;
    const top = shape.y;
    const right = shape.x + shape.width;
    const bottom = shape.y + shape.height;
    if (x < left || x > right || y < top || y > bottom) {
        return false;
    }
    const radius = shape.radius ?? 0;
    if (radius <= 0) {
        return true;
    }
    const cornerX = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
    const cornerY = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
    const dx = x - cornerX;
    const dy = y - cornerY;
    return dx * dx + dy * dy <= radius * radius;
}

/**
 * Renders {@link SCENE} at `size` x `size` pixels.
 *
 * @param {number} size
 * @returns {{ width: number, height: number, data: Buffer }} straight (unpremultiplied) RGBA.
 */
export function renderScene(size) {
    if (!Number.isInteger(size) || size <= 0) {
        throw new Error(`Brand asset size must be a positive integer, received ${size}.`);
    }
    const rgba = Buffer.alloc(size * size * 4);
    const scale = VIEWBOX / size;
    const step = scale / SUPERSAMPLE;
    const samples = SUPERSAMPLE * SUPERSAMPLE;

    for (const shape of SCENE) {
        const [red, green, blue] = parseColor(shape.fill);
        const shapeAlpha = shape.alpha ?? 1;
        for (let row = 0; row < size; row += 1) {
            const originY = row * scale;
            for (let column = 0; column < size; column += 1) {
                const originX = column * scale;
                let hits = 0;
                for (let subRow = 0; subRow < SUPERSAMPLE; subRow += 1) {
                    const y = originY + (subRow + 0.5) * step;
                    for (let subColumn = 0; subColumn < SUPERSAMPLE; subColumn += 1) {
                        if (insideShape(shape, originX + (subColumn + 0.5) * step, y)) {
                            hits += 1;
                        }
                    }
                }
                if (hits === 0) {
                    continue;
                }
                const sourceAlpha = (hits / samples) * shapeAlpha;
                const offset = (row * size + column) * 4;
                const destinationAlpha = rgba[offset + 3] / 255;
                const outAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
                if (outAlpha <= 0) {
                    continue;
                }
                const blend = (channel, source) => Math.round(
                    (source * sourceAlpha + (rgba[offset + channel] / 255) * destinationAlpha * (1 - sourceAlpha))
                    / outAlpha * 255
                );
                rgba[offset] = blend(0, red / 255);
                rgba[offset + 1] = blend(1, green / 255);
                rgba[offset + 2] = blend(2, blue / 255);
                rgba[offset + 3] = Math.round(outAlpha * 255);
            }
        }
    }

    return { width: size, height: size, data: rgba };
}

/** @returns {Buffer} a PNG of {@link SCENE} at `size` x `size`. */
export function renderScenePng(size) {
    const { width, height, data } = renderScene(size);
    return encodePng(width, height, data);
}

const round = (value) => String(Number(value.toFixed(4)));

/** Emits the editable vector source for the same scene, so SVG and PNG cannot diverge. */
export function buildSvg() {
    const body = SCENE.map((shape) => {
        const opacity = (shape.alpha ?? 1) === 1 ? "" : ` opacity="${round(shape.alpha)}"`;
        if (shape.kind === "rect") {
            return `  <rect x="${round(shape.x)}" y="${round(shape.y)}" width="${round(shape.width)}"`
                + ` height="${round(shape.height)}" rx="${round(shape.radius ?? 0)}" fill="${shape.fill}"${opacity}/>`;
        }
        if (shape.kind === "capsule") {
            return `  <line x1="${round(shape.x1)}" y1="${round(shape.y1)}" x2="${round(shape.x2)}"`
                + ` y2="${round(shape.y2)}" stroke="${shape.fill}" stroke-width="${round(shape.thickness)}"`
                + ` stroke-linecap="round"${opacity}/>`;
        }
        return `  <circle cx="${round(shape.cx)}" cy="${round(shape.cy)}" r="${round(shape.radius)}"`
            + ` fill="${shape.fill}"${opacity}/>`;
    });
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}" width="${VIEWBOX}"`
        + ` height="${VIEWBOX}" role="img" aria-label="Atlyn Control Chart">`,
        ...body,
        "</svg>",
        ""
    ].join("\n");
}

/**
 * The full set of generated brand assets.
 *
 * @returns {Array<{ relativePath: string, size?: number, kind: "png" | "svg", contents: Buffer }>}
 */
export function buildBrandAssets() {
    return [
        { relativePath: "assets/icon.svg", kind: "svg", contents: Buffer.from(buildSvg(), "utf8") },
        { relativePath: "assets/icon.png", kind: "png", size: ICON_SIZE, contents: renderScenePng(ICON_SIZE) },
        { relativePath: "assets/logo-300x300.png", kind: "png", size: LOGO_SIZE, contents: renderScenePng(LOGO_SIZE) }
    ];
}

/**
 * Compares committed brand assets against a fresh render.
 *
 * PNG bytes are compared as decoded RGBA rather than raw file bytes, because the DEFLATE
 * stream depends on the zlib build shipped with the running Node.js version. The pixels do
 * not, so this stays exact without being brittle across Node versions.
 *
 * @param {string} root repository root
 * @returns {string[]} human-readable drift messages; empty when everything matches
 */
export function verifyBrandAssets(root) {
    const problems = [];
    for (const asset of buildBrandAssets()) {
        const absolute = path.join(root, asset.relativePath);
        let committed;
        try {
            committed = readFileSync(absolute);
        } catch {
            problems.push(`${asset.relativePath} is missing; run \`npm run brand-assets\`.`);
            continue;
        }
        if (asset.kind === "svg") {
            if (committed.toString("utf8").replaceAll("\r\n", "\n") !== asset.contents.toString("utf8")) {
                problems.push(`${asset.relativePath} is stale; run \`npm run brand-assets\`.`);
            }
            continue;
        }
        let decoded;
        try {
            decoded = decodePng(committed);
        } catch (error) {
            problems.push(`${asset.relativePath} is not a decodable PNG: ${error.message}`);
            continue;
        }
        if (decoded.width !== asset.size || decoded.height !== asset.size) {
            problems.push(
                `${asset.relativePath} is ${decoded.width}x${decoded.height}, expected ${asset.size}x${asset.size}.`
            );
            continue;
        }
        if (!decoded.data.equals(decodePng(asset.contents).data)) {
            problems.push(`${asset.relativePath} pixels differ from the generator; run \`npm run brand-assets\`.`);
        }
    }
    return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
    const root = fileURLToPath(new URL("..", import.meta.url));
    for (const asset of buildBrandAssets()) {
        const absolute = path.join(root, asset.relativePath);
        mkdirSync(path.dirname(absolute), { recursive: true });
        writeFileSync(absolute, asset.contents);
        const dimensions = asset.size ? `${asset.size}x${asset.size}  ` : "";
        process.stdout.write(`Wrote ${asset.relativePath}  ${dimensions}${asset.contents.length} bytes\n`);
    }
}
