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
        expect(capabilities.dataRoles.map((role: { name: string }) => role.name)).toEqual([
            "Time", "Value", "Denominator", "Series", "BaselineGroup", "SubgroupSD", "Tooltips"
        ]);
    });

    test("uses a bounded categorical window without top reduction", () => {
        const capabilities = JSON.parse(readFileSync(join(root, "capabilities.json"), "utf8"));
        const mapping = capabilities.dataViewMappings[0].categorical;
        expect(mapping.categories.dataReductionAlgorithm.window.count).toBe(30000);
        expect(mapping.categories.dataReductionAlgorithm.top).toBeUndefined();
    });
});
