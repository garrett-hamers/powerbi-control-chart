import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Visual } from "../src/visual";
import { makeHost, visualDataView } from "./test-helpers";

/**
 * Regression tests for the small-tile layout.
 *
 * The visual's root is `overflow: hidden`, so anything the flex column cannot fit is
 * silently clipped rather than merely ugly. Before the stylesheet was actually packaged
 * these rules had never been exercised in a real render; once it shipped, a 260x200 tile
 * clipped away the legend and the entire accessible alarm table, and a 180x140 tile clipped
 * the chart itself, because the header and summary could not shrink and the chart shell had
 * a 90px floor.
 *
 * jsdom does not lay out, so these assert the two halves of the contract that are
 * observable without a layout engine: the size classes the visual sets, and the stylesheet
 * rules keyed off them. `scripts/probe-variants.mjs` measures the real geometry in a
 * browser.
 */

const root = join(__dirname, "..");
const less = readFileSync(join(root, "style", "visual.less"), "utf8");

const render = (width: number, height: number) => {
    const element = document.createElement("div");
    const mocked = makeHost();
    const visual = new Visual({ element, host: mocked.host, viewport: { width, height } } as any);
    visual.update({
        dataViews: [visualDataView([1, 2, 3, 4, 9, 2, 3, 1])],
        viewport: { width, height },
        type: 2
    } as any);
    const chart = element.querySelector(".atlyn-control-chart") as HTMLElement;
    return { element, visual, chart };
};

describe("small-tile layout", () => {
    test("marks narrow and short viewports so the stylesheet can drop chrome", () => {
        const wide = render(1280, 720);
        expect(wide.chart.classList.contains("is-narrow")).toBe(false);
        expect(wide.chart.classList.contains("is-short")).toBe(false);
        wide.visual.destroy();

        const narrow = render(300, 720);
        expect(narrow.chart.classList.contains("is-narrow")).toBe(true);
        expect(narrow.chart.classList.contains("is-short")).toBe(false);
        narrow.visual.destroy();

        const short = render(1280, 240);
        expect(short.chart.classList.contains("is-narrow")).toBe(false);
        expect(short.chart.classList.contains("is-short")).toBe(true);
        short.visual.destroy();

        const tile = render(260, 200);
        expect(tile.chart.classList.contains("is-narrow")).toBe(true);
        expect(tile.chart.classList.contains("is-short")).toBe(true);
        tile.visual.destroy();
    });

    test("re-evaluates the size classes when the host resizes the visual", () => {
        const element = document.createElement("div");
        const mocked = makeHost();
        const visual = new Visual({ element, host: mocked.host, viewport: { width: 1280, height: 720 } } as any);
        const update = (width: number, height: number) => visual.update({
            dataViews: [visualDataView([1, 2, 3, 4])],
            viewport: { width, height },
            type: 2
        } as any);

        update(1280, 720);
        const chart = element.querySelector(".atlyn-control-chart") as HTMLElement;
        expect(chart.classList.contains("is-narrow")).toBe(false);

        update(260, 200);
        expect(chart.classList.contains("is-narrow")).toBe(true);
        expect(chart.classList.contains("is-short")).toBe(true);

        // Resizing back must restore the full chrome, not leave the tile classes stuck on.
        update(1280, 720);
        expect(chart.classList.contains("is-narrow")).toBe(false);
        expect(chart.classList.contains("is-short")).toBe(false);
        visual.destroy();
    });

    test("keeps the chart and the accessible alarm table when chrome is dropped", () => {
        const { element, visual, chart } = render(260, 200);
        // Whatever is hidden, the data must survive: the chart and the alarm table.
        expect(chart.querySelector("svg.atlyn-chart")).not.toBeNull();
        expect(chart.querySelectorAll("circle.atlyn-point").length).toBeGreaterThan(0);
        expect(element.querySelector(".atlyn-alarm-panel")).not.toBeNull();
        visual.destroy();
    });

    test("stylesheet drops the legend and summary rather than the data", () => {
        expect(less).toContain(".atlyn-control-chart.is-narrow .atlyn-legend");
        expect(less).toContain(".atlyn-control-chart.is-short .atlyn-summary");
        // The alarm panel and the chart shell must never be hidden by a size class.
        expect(less).not.toMatch(/\.is-(narrow|short)\s+\.atlyn-alarm-panel\s*\{[^}]*display:\s*none/);
        expect(less).not.toMatch(/\.is-(narrow|short)\s+\.atlyn-chart-shell\s*\{[^}]*display:\s*none/);
    });

    test("lets every stacked region shrink so nothing escapes the clipped root", () => {
        // Anchored to line start so a compound selector like `.is-short .atlyn-summary` is
        // not mistaken for the base rule.
        const block = (selector: string) => {
            const match = new RegExp(`^\\${selector} \\{([\\s\\S]*?)^\\}`, "m").exec(less);
            expect(match).not.toBeNull();
            return (match as RegExpExecArray)[1];
        };
        // A flex item defaults to `min-height: auto` (min-content) in the main axis, which is
        // what let wrapped chrome push the data out of an overflow:hidden root.
        [".atlyn-summary", ".atlyn-chart-shell", ".atlyn-legend", ".atlyn-alarm-panel"].forEach((selector) => {
            expect(block(selector)).toContain("min-height: 0");
        });
        // The chart shell must not reintroduce a fixed floor taller than a small tile.
        expect(block(".atlyn-chart-shell")).not.toMatch(/min-height:\s*\d+px/);
        expect(block(".atlyn-control-chart")).toContain("overflow: hidden");
    });

    test("ellipsises the header instead of wrapping it over the whole tile", () => {
        const blocks = (selector: string) => {
            const matches = [...less.matchAll(new RegExp(`^\\${selector} \\{([\\s\\S]*?)^\\}`, "gm"))];
            expect(matches.length).toBeGreaterThan(0);
            return matches.map((match) => match[1]).join("\n");
        };
        // `text-overflow` only applies to a single line; without `nowrap` the title wrapped to
        // three lines at 180px and consumed over half the tile height.
        [".atlyn-title", ".atlyn-status"].forEach((selector) => {
            const rules = blocks(selector);
            expect(rules).toContain("text-overflow: ellipsis");
            expect(rules).toContain("white-space: nowrap");
            expect(rules).toContain("overflow: hidden");
        });
    });
});
