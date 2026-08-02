import { alarmIsVisible, evaluateRules } from "../src/rules";
import { calculatedPoint } from "./test-helpers";

describe("deterministic control rules", () => {
    const options = {
        sigmaMultiplier: 3,
        shiftLength: 3,
        trendLength: 4,
        resetOnBaselineChange: true
    };

    test("outside 3 sigma reports side, point, and explanation", () => {
        const alarms = evaluateRules([
            calculatedPoint(0, 0),
            calculatedPoint(1, 4),
            calculatedPoint(2, 0)
        ], options);
        const alarm = alarms.find((candidate) => candidate.rule === "outside3Sigma");
        expect(alarm).toMatchObject({
            pointIndex: 1,
            side: "high",
            windowStart: 1,
            windowEnd: 1
        });
        expect(alarm?.explanation).toContain("3 sigma");
    });

    test("localizes rule explanations", () => {
        const alarm = evaluateRules([
            calculatedPoint(0, 0),
            calculatedPoint(1, 4)
        ], { ...options, locale: "es-ES" }).find((candidate) => candidate.rule === "outside3Sigma");
        expect(alarm?.explanation).toContain("El valor");
        expect(alarm?.explanation).not.toContain("The value");
    });

    test("outside and two-of-three rules honor configurable multipliers", () => {
        const point = calculatedPoint(0, 2.5);
        expect(evaluateRules([point], options).some((alarm) => alarm.rule === "outside3Sigma")).toBe(false);
        expect(evaluateRules([point], { ...options, sigmaMultiplier: 2 })
            .find((alarm) => alarm.rule === "outside3Sigma")?.limit).toBe(2);
        const twoOfThree = evaluateRules([
            calculatedPoint(0, 1.5),
            calculatedPoint(1, 1.6),
            calculatedPoint(2, 0)
        ], { ...options, sigmaMultiplier: 6, twoSigmaMultiplier: 1 });
        expect(twoOfThree.find((alarm) => alarm.rule === "twoOfThree")).toMatchObject({
            pointIndices: [0, 1],
            limit: 1
        });
    });

    test("two of three requires the same side beyond 2 sigma", () => {
        const alarms = evaluateRules([
            calculatedPoint(0, 2.1),
            calculatedPoint(1, 2.2),
            calculatedPoint(2, 0)
        ], options);
        expect(alarms.filter((alarm) => alarm.rule === "twoOfThree")).toHaveLength(1);
        expect(alarms.find((alarm) => alarm.rule === "twoOfThree")).toMatchObject({
            pointIndices: [0, 1],
            limit: 2
        });
    });

    test("shift uses strict centerline side and marks the whole sequence", () => {
        const alarms = evaluateRules([
            calculatedPoint(0, 1),
            calculatedPoint(1, 2),
            calculatedPoint(2, 1),
            calculatedPoint(3, 0)
        ], options);
        const shift = alarms.find((alarm) => alarm.rule === "shift");
        expect(shift?.pointIndices).toEqual([0, 1, 2]);
        expect(shift?.side).toBe("high");
    });

    test("equal centerline breaks shift and trend sequences", () => {
        const alarms = evaluateRules([
            calculatedPoint(0, 1),
            calculatedPoint(1, 2),
            calculatedPoint(2, 0),
            calculatedPoint(3, 3),
            calculatedPoint(4, 4)
        ], options);
        expect(alarms.some((alarm) => alarm.rule === "shift")).toBe(false);
        expect(alarms.some((alarm) => alarm.rule === "trend")).toBe(false);
    });

    test("trend requires strict monotonic movement", () => {
        const alarms = evaluateRules([
            calculatedPoint(0, 1),
            calculatedPoint(1, 2),
            calculatedPoint(2, 3),
            calculatedPoint(3, 4)
        ], options);
        const trend = alarms.find((alarm) => alarm.rule === "trend");
        expect(trend?.pointIndices).toEqual([0, 1, 2, 3]);
        expect(trend?.side).toBe("both");
    });

    test("baseline boundary resets sequences unless joining is explicit", () => {
        const points = [
            calculatedPoint(0, 1, 0, 1, "before"),
            calculatedPoint(1, 1, 0, 1, "before"),
            calculatedPoint(2, 1, 0, 1, "after")
        ];
        expect(evaluateRules(points, options).some((alarm) => alarm.rule === "shift")).toBe(false);
        expect(evaluateRules(points, { ...options, resetOnBaselineChange: false })
            .some((alarm) => alarm.rule === "shift")).toBe(true);
    });

    test("run mode omits control-limit alarms but retains run rules", () => {
        const alarms = evaluateRules([
            calculatedPoint(0, 4),
            calculatedPoint(1, 5),
            calculatedPoint(2, 6)
        ], { ...options, mode: "run", trendLength: 3 });
        expect(alarms.some((alarm) => alarm.rule === "outside3Sigma")).toBe(false);
        expect(alarms.some((alarm) => alarm.rule === "twoOfThree")).toBe(false);
        expect(alarms.some((alarm) => alarm.rule === "trend")).toBe(true);
    });

    test("alarm identities remain composite across series with reused row indexes", () => {
        const alarms = evaluateRules([
            calculatedPoint(0, 4, 0, 1, "base", { seriesKey: "A", seriesLabel: "A" }),
            calculatedPoint(0, -4, 0, 1, "base", { seriesKey: "B", seriesLabel: "B" })
        ], options);
        const outside = alarms.filter((alarm) => alarm.rule === "outside3Sigma");
        expect(outside).toHaveLength(2);
        expect(new Set(outside.map((alarm) => alarm.pointKey)).size).toBe(2);
        expect(outside.map((alarm) => alarm.pointKeys[0])).toEqual(expect.arrayContaining(["A\u001fbase\u001f0", "B\u001fbase\u001f0"]));
    });

    test("direction semantics identify visible adverse sides", () => {
        const alarms = evaluateRules([calculatedPoint(0, 4), calculatedPoint(1, -4)], options);
        const high = alarms.find((alarm) => alarm.side === "high");
        const low = alarms.find((alarm) => alarm.side === "low");
        expect(high && alarmIsVisible(high, "lowerIsBetter")).toBe(true);
        expect(high && alarmIsVisible(high, "higherIsBetter")).toBe(false);
        expect(low && alarmIsVisible(low, "higherIsBetter")).toBe(true);
        expect(low && alarmIsVisible(low, "lowerIsBetter")).toBe(false);
        expect(high && alarmIsVisible(high, "both")).toBe(true);
        expect(high && alarmIsVisible(high, "neutral")).toBe(true);
    });
});
