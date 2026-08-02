import { calculateChart, validateRow } from "../src/statistics";
import { ChartRow } from "../src/types";
import { row, settings } from "./test-helpers";

function closeTo(actual: number, expected: number, precision = 8): void {
    expect(actual).toBeCloseTo(expected, precision);
}

describe("golden statistical calculations", () => {
    test("Individuals uses mean moving range and 1.128", () => {
        const result = calculateChart([row(0, 10), row(1, 12), row(2, 11), row(3, 13)], settings("individuals"));
        const point = result.points[0];
        closeTo(point.centerline, 11.5);
        closeTo(point.sigma, (2 + 1 + 2) / 3 / 1.128);
        closeTo(point.lowerThree, 11.5 - 3 * point.sigma);
        closeTo(point.upperThree, 11.5 + 3 * point.sigma);
    });

    test("Run centers on the median", () => {
        const result = calculateChart([row(0, 1), row(1, 100), row(2, 2)], settings("run"));
        expect(result.points[0].centerline).toBe(2);
        expect(result.formula).toContain("median");
    });

    test("localizes statistical formulas", () => {
        const result = calculateChart(
            [row(0, 1), row(1, 100), row(2, 2)],
            { ...settings("run"), locale: "es-ES" }
        );
        expect(result.formula).toContain("mediana");
        expect(result.formula).not.toContain("Conventional run chart");
    });

    test("P uses total numerator and total denominator with varying limits", () => {
        const rows = [
            row(0, 1, { denominator: 10 }),
            row(1, 4, { denominator: 20 }),
            row(2, 1, { denominator: 10 })
        ];
        const result = calculateChart(rows, settings("p"));
        expect(result.points.map((point) => point.value)).toEqual([0.1, 0.2, 0.1]);
        expect(result.points.map((point) => point.rawValue)).toEqual([1, 4, 1]);
        closeTo(result.points[0].centerline, 0.15);
        closeTo(result.points[0].sigma, Math.sqrt(0.15 * 0.85 / 10));
        closeTo(result.points[1].sigma, Math.sqrt(0.15 * 0.85 / 20));
        expect(result.points[0].lowerThree).toBe(0);
        expect(result.points[0].upperThree).toBeLessThanOrEqual(1);
    });

    test("U uses total count and total exposure with varying limits", () => {
        const rows = [
            row(0, 1, { denominator: 10 }),
            row(1, 4, { denominator: 20 })
        ];
        const result = calculateChart(rows, settings("u"));
        expect(result.points.map((point) => point.value)).toEqual([0.1, 0.2]);
        expect(result.points.map((point) => point.rawValue)).toEqual([1, 4]);
        closeTo(result.points[0].centerline, 5 / 30);
        closeTo(result.points[0].sigma, Math.sqrt((5 / 30) / 10));
        closeTo(result.points[1].sigma, Math.sqrt((5 / 30) / 20));
        expect(result.points[0].lowerThree).toBe(0);
    });

    test("C uses mean count and square-root mean sigma", () => {
        const result = calculateChart([row(0, 1), row(1, 4), row(2, 0)], settings("c"));
        closeTo(result.points[0].centerline, 5 / 3);
        closeTo(result.points[0].sigma, Math.sqrt(5 / 3));
        expect(result.points[0].lowerThree).toBe(0);
    });

    test("specification status stays distinct from control limits", () => {
        const result = calculateChart(
            [row(0, 10), row(1, 11), row(2, 12)],
            { ...settings("individuals"), specificationLower: 10.5, specificationUpper: 11.5 }
        );
        expect(result.points.map((point) => point.specificationStatus)).toEqual(["below", "within", "above"]);
        expect(result.points[1].lowerThree).not.toBe(10.5);
        expect(result.points[1].upperThree).not.toBe(11.5);
    });

    test("P specifications compare normalized rates, not raw numerators", () => {
        const result = calculateChart(
            [
                row(0, 1, { denominator: 10 }),
                row(1, 6, { denominator: 20 })
            ],
            {
                ...settings("p"),
                specificationLower: 0.15,
                specificationUpper: 0.25
            }
        );
        expect(result.points.map((point) => point.value)).toEqual([0.1, 0.3]);
        expect(result.points.map((point) => point.specificationStatus)).toEqual(["below", "above"]);
    });

    test("P alarms use normalized rates and configured control multipliers", () => {
        const rows = [
            ...Array.from({ length: 9 }, (_, index) => row(index, 0, { denominator: 100 })),
            row(9, 100, { denominator: 100 })
        ];
        const result = calculateChart(rows, {
            ...settings("p"),
            sigmaMultiplier: 2,
            enableTwoOfThree: false,
            enableShift: false,
            enableTrend: false
        });
        const point = result.points[9];
        expect(point.value).toBe(1);
        expect(point.controlUpper).toBeCloseTo(0.16, 8);
        const alarm = result.alarms.find((candidate) => candidate.side === "high");
        expect(alarm).toMatchObject({
            rule: "outside3Sigma",
            value: 1,
            limit: 0.16,
            pointKey: point.pointKey
        });
    });

    test("baseline groups produce deterministic independent baselines", () => {
        const rows = [
            row(0, 1, { baselineKey: "before", baselineLabel: "before" }),
            row(1, 3, { baselineKey: "before", baselineLabel: "before" }),
            row(2, 10, { baselineKey: "after", baselineLabel: "after" }),
            row(3, 12, { baselineKey: "after", baselineLabel: "after" })
        ];
        const result = calculateChart(rows, settings("individuals"));
        expect(result.points[0].centerline).toBe(2);
        expect(result.points[2].centerline).toBe(11);
        expect(result.points[0].baselineLabel).toBe("before");
        expect(result.points[2].baselineLabel).toBe("after");
    });

    test("mode validation rejects invalid denominators and numerators", () => {
        expect(validateRow("individuals", 1, undefined)).toBe(true);
        expect(validateRow("p", 1, 0)).toBe(false);
        expect(validateRow("p", 11, 10)).toBe(false);
        expect(validateRow("u", 1, -2)).toBe(false);
        expect(validateRow("c", -1, undefined)).toBe(false);
        expect(validateRow("run", Number.NaN, undefined)).toBe(false);
    });

    test("empty rows are deterministic", () => {
        const result = calculateChart([] as ChartRow[], settings("individuals"));
        expect(result.points).toHaveLength(0);
        expect(result.alarms).toHaveLength(0);
        expect(result.receivedRows).toBe(0);
    });

    test("orders points by time sort key before calculating sequences", () => {
        const result = calculateChart(
            [
                row(0, 30, { time: "2024-01-03", timeSortKey: 3 }),
                row(1, 10, { time: "2024-01-01", timeSortKey: 1 }),
                row(2, 20, { time: "2024-01-02", timeSortKey: 2 })
            ],
            settings("run")
        );
        expect(result.points.map((point) => point.value)).toEqual([10, 20, 30]);
        expect(result.points.map((point) => point.time)).toEqual(["2024-01-01", "2024-01-02", "2024-01-03"]);
    });

    test("drops invalid rows while preserving a deterministic completeness count", () => {
        const result = calculateChart(
            [row(0, 1, { denominator: 0 }), row(1, 2, { denominator: 10 })],
            settings("p")
        );
        expect(result.points).toHaveLength(1);
        expect(result.droppedRows).toBe(1);
        expect(result.receivedRows).toBe(2);
        expect(result.dataStatus).toBe("complete");
    });
});
