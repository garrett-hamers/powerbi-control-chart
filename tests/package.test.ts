import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

describe("package metadata", () => {
    test("keeps the visual identity and certification privileges stable", () => {
        const pbiviz = JSON.parse(readFileSync(join(root, "pbiviz.json"), "utf8"));
        const capabilities = JSON.parse(readFileSync(join(root, "capabilities.json"), "utf8"));
        expect(pbiviz.visual.name).toBe("atlynControlChart");
        expect(pbiviz.visual.guid).toBe("atlynControlChartA1B2C3D4E5F6G7H8I9J0");
        expect(pbiviz.visual.version).toBe("1.0.1.0");
        expect(pbiviz.visual.supportUrl).toBe("https://atlyn.io/contact");
        expect(pbiviz.author).toEqual({ name: "Atlyn", email: "atlyn.help@gmail.com" });
        expect(pbiviz.visual.description.length).toBeGreaterThanOrEqual(40);
        expect(capabilities.privileges).toEqual([]);
        expect(pbiviz.externalJS).toBeNull();
        expect(pbiviz.stringResources).toHaveLength(5);
        expect(capabilities.dataRoles.map((role: { name: string }) => role.name)).toEqual([
            "Time", "Value", "Denominator", "SubgroupSD", "Series", "BaselineGroup", "Tooltips"
        ]);
        expect(capabilities.dataViewMappings[0].conditions).toEqual(expect.arrayContaining([
            expect.objectContaining({ Time: { min: 1, max: 1 }, Value: { min: 1, max: 1 } })
        ]));
    });

    test("uses a bounded categorical window without top reduction", () => {
        const capabilities = JSON.parse(readFileSync(join(root, "capabilities.json"), "utf8"));
        const mapping = capabilities.dataViewMappings[0].categorical;
        expect(mapping.categories.dataReductionAlgorithm.window.count).toBe(30000);
        expect(mapping.categories.dataReductionAlgorithm.top).toBeUndefined();
    });

    test("keeps certification lint and audit gates explicit", () => {
        const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
        expect(packageJson.devDependencies["eslint-plugin-powerbi-visuals"]).toBe("1.1.1");
        expect(packageJson.devDependencies.jszip).toBe("3.10.1");
        expect(packageJson.scripts.eslint).toBe("npx eslint . --ext .js,.jsx,.ts,.tsx");
        expect(packageJson.scripts.audit).toContain("--audit-level=moderate");
    });

    test("fails packaging when pbiviz exits unsuccessfully", () => {
        const packageScript = readFileSync(join(root, "scripts/package.mjs"), "utf8");
        expect(packageScript).toContain("if (result.status !== 0)");
        expect(packageScript).toContain("process.exit(result.status ?? 1)");
        expect(packageScript).not.toContain("packageExists");
        expect(packageScript).toContain("normalizer");
        expect(packageScript).toContain("normalization.status");
    });

    test("keeps release metadata and parity audit wired", () => {
        const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
        for (const file of ["LICENSE", "CHANGELOG.md", "SECURITY.md", "CONTRIBUTING.md", "EULA.md"]) {
            expect(() => readFileSync(join(root, file), "utf8")).not.toThrow();
        }
        expect(packageJson.scripts["source-parity-audit"]).toBe("node scripts/source-parity-audit.mjs");
        expect(packageJson.scripts["release-manifest"]).toBe("node scripts/release-manifest.mjs");
        expect(packageJson.scripts["package-reproducibility"]).toBe("node scripts/package-reproducibility.mjs");
        expect(packageJson.scripts["brand-assets"]).toBe("node scripts/build-brand-assets.mjs");
        expect(packageJson.scripts["submission-audit"]).toBe("node scripts/audit-submission-assets.mjs");
        expect(packageJson.scripts["sample-report"]).toBe("node scripts/build-sample-report.mjs");
        expect(packageJson.scripts.screenshots).toBe("node scripts/capture-screenshots.mjs");
        expect(packageJson.devDependencies.jszip).toBe("3.10.1");
        expect(readFileSync(join(root, "scripts/package-reproducibility.mjs"), "utf8")).toContain(
            "clean package runs produced different bytes"
        );
        expect(readFileSync(join(root, "scripts/normalize-package.mjs"), "utf8")).toContain(
            "unixPermissions"
        );
        expect(readFileSync(join(root, "scripts/release-manifest.mjs"), "utf8")).toContain(
            "expected exactly one current package artifact"
        );
    });

    test("imports the stylesheet so the packaged visual is not shipped unstyled", () => {
        // MiniCssExtractPlugin only emits content.css when the webpack entry imports the Less
        // file. pbiviz.json's `style` field is metadata and does not pull it into the module
        // graph, so without this import `pbiviz package` succeeds and ships a visual with no CSS.
        expect(readFileSync(join(root, "src/visual.ts"), "utf8")).toContain('import "./../style/visual.less";');
        expect(readFileSync(join(root, "style/visual.less"), "utf8").length).toBeGreaterThan(1000);

        // Source-level guard (order-independent) and packaged-bytes guard (needs dist/).
        expect(readFileSync(join(root, "scripts/certification-audit.mjs"), "utf8")).toContain(
            "does not import ${pbiviz.style}"
        );
        expect(readFileSync(join(root, "scripts/audit-submission-assets.mjs"), "utf8")).toContain(
            "Packaged visual has no content.css"
        );
    });

    test("ships a 20x20 visualization-pane icon and a separate 300x300 listing logo", () => {
        // These are two different Microsoft requirements. The visualization-pane icon is
        // documented as a 20x20 PNG; the Partner Center listing logo is 300x300.
        const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const contracts: Array<[string, number]> = [
            ["assets/icon.png", 20],
            ["assets/logo-300x300.png", 300]
        ];
        for (const [relativePath, size] of contracts) {
            const image = readFileSync(join(root, relativePath));
            expect(image.subarray(0, 8).equals(pngSignature)).toBe(true);
            expect(image.readUInt32BE(16)).toBe(size);
            expect(image.readUInt32BE(20)).toBe(size);
        }

        const pbiviz = JSON.parse(readFileSync(join(root, "pbiviz.json"), "utf8"));
        expect(pbiviz.assets.icon).toBe("assets/icon.png");

        const audit = readFileSync(join(root, "scripts/certification-audit.mjs"), "utf8");
        expect(audit).toContain('relativePath: "assets/icon.png", size: 20');
        expect(audit).toContain('relativePath: "assets/logo-300x300.png", size: 300');
    });
});
