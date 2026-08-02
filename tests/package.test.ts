import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

describe("package metadata", () => {
    test("keeps the visual identity and certification privileges stable", () => {
        const pbiviz = JSON.parse(readFileSync(join(root, "pbiviz.json"), "utf8"));
        const capabilities = JSON.parse(readFileSync(join(root, "capabilities.json"), "utf8"));
        expect(pbiviz.visual.name).toBe("atlynControlChart");
        expect(pbiviz.visual.guid).toBe("atlynControlChartA1B2C3D4E5F6G7H8I9J0");
        expect(pbiviz.visual.version).toBe("1.0.0.0");
        expect(capabilities.privileges).toEqual([]);
        expect(pbiviz.externalJS).toBeNull();
        expect(pbiviz.stringResources).toHaveLength(5);
        expect(capabilities.dataRoles.map((role: { name: string }) => role.name)).toEqual([
            "Time", "Value", "Denominator", "Series", "BaselineGroup", "Tooltips"
        ]);
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
        expect(packageJson.scripts.eslint).toBe("npx eslint . --ext .js,.jsx,.ts,.tsx");
        expect(packageJson.scripts.audit).toContain("--audit-level=moderate");
    });

    test("fails packaging when pbiviz exits unsuccessfully", () => {
        const packageScript = readFileSync(join(root, "scripts/package.mjs"), "utf8");
        expect(packageScript).toContain("if (result.status !== 0)");
        expect(packageScript).toContain("process.exit(result.status ?? 1)");
        expect(packageScript).not.toContain("packageExists");
    });
});
