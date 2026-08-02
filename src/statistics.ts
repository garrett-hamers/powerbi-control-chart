import {
    Alarm,
    CalculatedPoint,
    CalculationOptions,
    ChartMode,
    ChartResult,
    ChartRow,
    PointStatistics,
    RuleOptions
} from "./types";
import { evaluateRules } from "./rules";

const INDIVIDUALS_CONSTANT = 1.128;

function finite(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function mean(values: number[]): number {
    return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function standardDeviationAround(values: number[], center: number): number {
    if (values.length < 2) {
        return 0;
    }
    const variance = values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length;
    return Math.sqrt(Math.max(variance, 0));
}

function individualsStatistics(values: number[]): PointStatistics {
    const centerline = mean(values);
    const movingRanges = values.slice(1).map((value, index) => Math.abs(value - values[index]));
    const sigma = movingRanges.length === 0 ? 0 : mean(movingRanges) / INDIVIDUALS_CONSTANT;
    return createBands(centerline, sigma);
}

function runStatistics(values: number[]): PointStatistics {
    const centerline = median(values);
    return createBands(centerline, standardDeviationAround(values, centerline));
}

function pStatistics(rows: ChartRow[]): PointStatistics {
    const denominatorTotal = rows.reduce((sum, row) => sum + (row.denominator ?? 0), 0);
    const numeratorTotal = rows.reduce((sum, row) => sum + row.value, 0);
    const centerline = denominatorTotal > 0 ? numeratorTotal / denominatorTotal : 0;
    return createBands(centerline, Math.sqrt(Math.max(centerline * (1 - centerline), 0)));
}

function uStatistics(rows: ChartRow[]): PointStatistics {
    const denominatorTotal = rows.reduce((sum, row) => sum + (row.denominator ?? 0), 0);
    const countTotal = rows.reduce((sum, row) => sum + row.value, 0);
    const centerline = denominatorTotal > 0 ? countTotal / denominatorTotal : 0;
    return createBands(centerline, Math.sqrt(Math.max(centerline, 0)));
}

function cStatistics(rows: ChartRow[]): PointStatistics {
    const centerline = mean(rows.map((row) => row.value));
    return createBands(centerline, Math.sqrt(Math.max(centerline, 0)));
}

function createBands(centerline: number, sigma: number): PointStatistics {
    return {
        centerline,
        sigma,
        lowerOne: centerline - sigma,
        upperOne: centerline + sigma,
        lowerTwo: centerline - 2 * sigma,
        upperTwo: centerline + 2 * sigma,
        lowerThree: centerline - 3 * sigma,
        upperThree: centerline + 3 * sigma
    };
}

function clampLimits(mode: ChartMode, statistics: PointStatistics): PointStatistics {
    if (mode === "p") {
        return {
            ...statistics,
            lowerOne: Math.max(0, statistics.lowerOne),
            upperOne: Math.min(1, statistics.upperOne),
            lowerTwo: Math.max(0, statistics.lowerTwo),
            upperTwo: Math.min(1, statistics.upperTwo),
            lowerThree: Math.max(0, statistics.lowerThree),
            upperThree: Math.min(1, statistics.upperThree)
        };
    }
    if (mode === "u" || mode === "c") {
        return {
            ...statistics,
            lowerOne: Math.max(0, statistics.lowerOne),
            lowerTwo: Math.max(0, statistics.lowerTwo),
            lowerThree: Math.max(0, statistics.lowerThree)
        };
    }
    return statistics;
}

function baseStatistics(mode: ChartMode, rows: ChartRow[]): PointStatistics {
    switch (mode) {
        case "individuals":
            return individualsStatistics(rows.map((row) => row.value));
        case "run":
            return runStatistics(rows.map((row) => row.value));
        case "p":
            return pStatistics(rows);
        case "u":
            return uStatistics(rows);
        case "c":
            return cStatistics(rows);
    }
}

function pointStatistics(mode: ChartMode, row: ChartRow, segmentStatistics: PointStatistics): PointStatistics {
    if (mode === "p") {
        const denominator = row.denominator ?? 0;
        const sigma = denominator > 0
            ? Math.sqrt(Math.max(segmentStatistics.centerline * (1 - segmentStatistics.centerline) / denominator, 0))
            : 0;
        return clampLimits(mode, createBands(segmentStatistics.centerline, sigma));
    }
    if (mode === "u") {
        const denominator = row.denominator ?? 0;
        const sigma = denominator > 0
            ? Math.sqrt(Math.max(segmentStatistics.centerline / denominator, 0))
            : 0;
        return clampLimits(mode, createBands(segmentStatistics.centerline, sigma));
    }
    return clampLimits(mode, segmentStatistics);
}

function formulaFor(mode: ChartMode): string {
    switch (mode) {
        case "individuals":
            return "CL = mean(x); MR = |xᵢ − xᵢ₋₁|; σ = mean(MR) / 1.128; limits = CL ± 3σ";
        case "run":
            return "CL = median(x); σ = population SD around the median; limits = CL ± 3σ";
        case "p":
            return "pᵢ = dᵢ / nᵢ; p̄ = Σd / Σn; σᵢ = √(p̄(1 − p̄) / nᵢ)";
        case "u":
            return "uᵢ = cᵢ / nᵢ; ū = Σc / Σn; σᵢ = √(ū / nᵢ)";
        case "c":
            return "CL = mean(c); σ = √CL; LCL = max(0, CL − 3σ)";
    }
}

function specificationStatus(
    value: number,
    lower: number | undefined,
    upper: number | undefined
): CalculatedPoint["specificationStatus"] {
    if (!finite(lower) && !finite(upper)) {
        return "notConfigured";
    }
    if (finite(lower) && value < lower) {
        return "below";
    }
    if (finite(upper) && value > upper) {
        return "above";
    }
    return "within";
}

function contiguousSegments(rows: ChartRow[]): ChartRow[][] {
    const segments: ChartRow[][] = [];
    let current: ChartRow[] = [];
    let currentKey: string | undefined;
    for (const row of rows) {
        if (current.length > 0 && row.baselineKey !== currentKey) {
            segments.push(current);
            current = [];
        }
        current.push(row);
        currentKey = row.baselineKey;
    }
    if (current.length > 0) {
        segments.push(current);
    }
    return segments;
}

function annotateAlarms(points: CalculatedPoint[], alarms: Alarm[]): void {
    for (const alarm of alarms) {
        for (const index of alarm.pointIndices) {
            const point = points.find((candidate) => candidate.index === index);
            if (point && !point.alarms.includes(alarm.rule)) {
                point.alarms.push(alarm.rule);
            }
        }
    }
}

function calculateSeries(
    rows: ChartRow[],
    options: CalculationOptions
): { points: CalculatedPoint[]; alarms: Alarm[] } {
    const points: CalculatedPoint[] = [];
    const segments = contiguousSegments(rows);
    for (const segment of segments) {
        const segmentStatistics = baseStatistics(options.mode, segment);
        for (const row of segment) {
            const statistics = pointStatistics(options.mode, row, segmentStatistics);
            points.push({
                ...row,
                ...statistics,
                specificationStatus: specificationStatus(
                    row.value,
                    options.specificationLower,
                    options.specificationUpper
                ),
                alarms: []
            });
        }
    }
    const alarms = evaluateRules(points, {
        sigmaMultiplier: options.sigmaMultiplier,
        shiftLength: options.shiftLength,
        trendLength: options.trendLength,
        resetOnBaselineChange: !options.joinRebaselineRules
    } satisfies RuleOptions);
    annotateAlarms(points, alarms);
    return { points, alarms };
}

export function calculateChart(rows: ChartRow[], options: CalculationOptions): ChartResult {
    const seriesKeys = [...new Set(rows.map((row) => row.seriesKey))];
    const allPoints: CalculatedPoint[] = [];
    const allAlarms: Alarm[] = [];
    for (const seriesKey of seriesKeys) {
        const seriesRows = rows.filter((row) => row.seriesKey === seriesKey);
        const calculated = calculateSeries(seriesRows, options);
        allPoints.push(...calculated.points);
        allAlarms.push(...calculated.alarms);
    }
    return {
        mode: options.mode,
        points: allPoints,
        alarms: allAlarms,
        series: seriesKeys,
        formula: formulaFor(options.mode),
        droppedRows: 0,
        receivedRows: rows.length,
        hasHighlights: rows.some((row) => row.highlighted !== undefined),
        specificationLower: options.specificationLower,
        specificationUpper: options.specificationUpper
    };
}

export function validateRow(mode: ChartMode, value: unknown, denominator: unknown): boolean {
    if (!finite(value)) {
        return false;
    }
    if (mode === "p" || mode === "u") {
        if (!finite(denominator) || denominator <= 0) {
            return false;
        }
    }
    if (mode === "p" && (value < 0 || !finite(denominator) || value > denominator)) {
        return false;
    }
    if ((mode === "u" || mode === "c") && value < 0) {
        return false;
    }
    return true;
}
