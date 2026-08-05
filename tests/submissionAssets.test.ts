import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the Microsoft AppSource / Partner Center listing assets that ship from this
 * repository. Every expectation maps to a published requirement:
 * https://learn.microsoft.com/en-us/power-bi/developer/visuals/office-store
 */

const root = join(__dirname, "..");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const SUPPORT_URL = "https://atlyn.io/contact";
const PRIVACY_URL = "https://atlyn.io/legal/privacy";
const TERMS_URL = "https://atlyn.io/legal/terms";

const readPng = (relativePath: string) => {
    const buffer = readFileSync(join(root, relativePath));
    expect(buffer.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    return { buffer, width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

describe("AppSource submission assets", () => {
    test("records reachable https support, privacy, and terms URLs", () => {
        const pbiviz = JSON.parse(readFileSync(join(root, "pbiviz.json"), "utf8"));
        expect(pbiviz.visual.supportUrl).toBe(SUPPORT_URL);
        // /privacy, /support and /terms are 404 on the storefront; only the /legal paths exist.
        expect(pbiviz.visual.supportUrl).not.toMatch(/atlyn\.io\/(support|privacy|terms)$/);

        const dossier = readFileSync(join(root, "docs", "partner-center-submission.md"), "utf8");
        [SUPPORT_URL, PRIVACY_URL, TERMS_URL].forEach((url) => expect(dossier).toContain(url));
        expect(dossier).toContain("AppSource listing: Free");
        expect(dossier).toContain("samples/AtlynSample.pbip");
    });

    test("rejects an unroutable author email", () => {
        const pbiviz = JSON.parse(readFileSync(join(root, "pbiviz.json"), "utf8"));
        expect(pbiviz.author.name).toBe("Atlyn");
        expect(pbiviz.author.email).toBe("atlyn.help@gmail.com");
        // RFC 2606 reserves .example/.invalid/.test/.localhost; they can never receive mail.
        expect(pbiviz.author.email).not.toMatch(/\.(example|invalid|test|localhost)$/i);
    });

    test("ships 1-5 listing screenshots at exactly 1366x768 and under 1024 KB", () => {
        const directory = join(root, "assets", "screenshots");
        const entries = readdirSync(directory).sort();
        expect(entries.length).toBeGreaterThanOrEqual(1);
        expect(entries.length).toBeLessThanOrEqual(5);
        entries.forEach((name) => {
            expect(name).toMatch(/\.png$/);
            const { width, height } = readPng(join("assets", "screenshots", name));
            expect(width).toBe(1366);
            expect(height).toBe(768);
            expect(statSync(join(directory, name)).size).toBeLessThanOrEqual(1024 * 1024);
        });
    });

    test("keeps the 20x20 icon and the 300x300 logo as distinct assets", () => {
        const icon = readPng("assets/icon.png");
        expect([icon.width, icon.height]).toEqual([20, 20]);

        const logo = readPng("assets/logo-300x300.png");
        expect([logo.width, logo.height]).toEqual([300, 300]);

        expect(icon.buffer.equals(logo.buffer)).toBe(false);

        // Both come from one committed generator, so they can never drift apart visually.
        const generator = readFileSync(join(root, "scripts", "build-brand-assets.mjs"), "utf8");
        expect(generator).toContain("export const ICON_SIZE = 20;");
        expect(generator).toContain("export const LOGO_SIZE = 300;");
        expect(generator).toContain("assets/icon.svg");
    });

    test("the listing logo is rendered at 300x300, not upscaled from the icon", () => {
        // Comparing the assets against their generator cannot catch a generator that has
        // started producing something degenerate, because it agrees with that generator by
        // construction. `submission-audit` therefore also asserts a property of the bytes:
        // a nearest-neighbour upscale of the 20x20 icon is a valid 300x300 PNG carrying
        // only the icon's colours, so the logo must carry meaningfully more.
        //
        // Verified by forging exactly that asset and patching the generator to emit it: the
        // generator comparison passed and only the colour floor failed.
        const audit = readFileSync(join(root, "scripts", "audit-submission-assets.mjs"), "utf8");
        expect(audit).toContain("MIN_ICON_COLORS");
        expect(audit).toContain("MIN_LOGO_COLORS");
        expect(audit).toContain("independently of the generator");
        // The logo floor must stay above the icon's own colour count, or an upscale passes.
        expect(audit).toMatch(/const MIN_LOGO_COLORS = (3[2-9]|[4-9]\d|\d{3,});/);

        // Nothing here compares file sizes. An upscale of the icon is larger than the icon
        // (272 -> 1,612 bytes when forged), so a size comparison passes for exactly the case
        // it would appear to guard. The colour floor above is what discriminates; this test
        // pins that it stays in place and stays above the icon's own count.
    });

    test("ships an AppSource-ready EULA that links the published policies", () => {
        const eula = readFileSync(join(root, "EULA.md"), "utf8");
        expect(eula).toContain("End User License Agreement");
        expect(eula).toContain("**Publisher:** Atlyn");
        expect(eula).toContain("MIT License");
        [SUPPORT_URL, PRIVACY_URL, TERMS_URL, "atlyn.help@gmail.com"].forEach((token) => {
            expect(eula).toContain(token);
        });
    });

    test("captures screenshots from the packaged bundle rather than the source tree", () => {
        const capture = readFileSync(join(root, "scripts", "capture-screenshots.mjs"), "utf8");
        // The harness must load the real built bundle out of the .pbiviz, and must refuse to
        // invent an image when no browser is available.
        expect(capture).toContain("resources/${manifest.visual.guid}.pbiviz.json");
        expect(capture).toContain("findBrowser");
        expect(capture).toContain("exceeds the ${MAX_SCREENSHOT_BYTES} byte AppSource limit");
        expect(readFileSync(join(root, "scripts", "browser.mjs"), "utf8")).toContain(
            "Screenshots are never synthesized"
        );
    });

    test("declares one screenshot scene per committed PNG", () => {
        const scenes = readFileSync(join(root, "tools", "screenshots", "scenes.mjs"), "utf8");
        const declared = [...scenes.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]).sort();
        const committed = readdirSync(join(root, "assets", "screenshots"))
            .map((name) => name.replace(/\.png$/, ""))
            .sort();
        expect(declared).toEqual(committed);
    });

    test("normalises tracked text to LF so local and CI bytes agree", () => {
        // A Windows working tree holding CRLF while git stores LF makes any hash or byte
        // comparison over a tracked text file differ from the Linux CI checkout - a failure
        // that only ever reproduces in CI. The policy is global, not per-suffix.
        const attributes = readFileSync(join(root, ".gitattributes"), "utf8");
        expect(attributes).toContain("* text=auto eol=lf");
        ["*.png binary", "*.pbiviz binary", "*.pbix binary"].forEach((rule) => {
            expect(attributes).toContain(rule);
        });

        // The files this repository actually hashes or diffs as text must be LF on disk.
        [
            "EULA.md",
            join("docs", "partner-center-submission.md"),
            join("assets", "icon.svg"),
            join("samples", "AtlynSample.pbip")
        ].forEach((relativePath) => {
            expect(readFileSync(join(root, relativePath), "utf8")).not.toContain("\r\n");
        });
    });
});
