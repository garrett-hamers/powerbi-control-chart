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
const DEFAULT_SIGMA_MULTIPLIER = 3;
const DEFAULT_TWO_SIGMA_MULTIPLIER = 2;
const DEFAULT_SUBGROUP_SIZE = 5;

function finite(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function mean(values: number[]): number {
    return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function weightedMean(values: Array<{ value: number; weight: number }>): number {
    const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
    return totalWeight > 0
        ? values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight
        : mean(values.map((item) => item.value));
}

function median(values: number[]): number {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function multiplier(value: number | undefined, fallback: number, minimum = 0): number {
    return finite(value) && value >= minimum ? value : fallback;
}

function rawValue(row: ChartRow): number {
    return row.rawValue ?? row.value;
}

function subgroupSize(row: ChartRow): number {
    return finite(row.denominator) && row.denominator >= 2
        ? row.denominator
        : DEFAULT_SUBGROUP_SIZE;
}

function c4(size: number): number {
    const rounded = Math.max(2, Math.min(10, Math.round(size)));
    const values: Record<number, number> = {
        2: 0.79788456,
        3: 0.88622693,
        4: 0.92131773,
        5: 0.93998560,
        6: 0.95153286,
        7: 0.95936879,
        8: 0.96503046,
        9: 0.96931070,
        10: 0.97265927
    };
    return values[rounded] ?? 1 - 1 / (4 * rounded) - 7 / (32 * rounded * rounded);
}

function d2(size: number): number {
    const rounded = Math.max(2, Math.min(10, Math.round(size)));
    const values: Record<number, number> = {
        2: 1.128,
        3: 1.693,
        4: 2.059,
        5: 2.326,
        6: 2.534,
        7: 2.704,
        8: 2.847,
        9: 2.970,
        10: 3.078
    };
    return values[rounded] ?? Math.sqrt(rounded);
}

function d3(size: number): number {
    const rounded = Math.max(2, Math.min(10, Math.round(size)));
    return ({ 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0.076, 8: 0.136, 9: 0.184, 10: 0.223 } as Record<number, number>)[rounded] ?? 0;
}

function d4(size: number): number {
    const rounded = Math.max(2, Math.min(10, Math.round(size)));
    return ({ 2: 3.267, 3: 2.574, 4: 2.282, 5: 2.114, 6: 2.004, 7: 1.924, 8: 1.864, 9: 1.816, 10: 1.777 } as Record<number, number>)[rounded] ?? 1 + 3 / d2(rounded);
}

function sConstants(size: number): { lower: number; upper: number } {
    const c4Value = c4(size);
    const ratio = Math.sqrt(Math.max(1 - c4Value * c4Value, 0)) / c4Value;
    return {
        lower: Math.max(0, 1 - 3 * ratio),
        upper: 1 + 3 * ratio
    };
}

function createBands(
    centerline: number,
    sigma: number,
    controlMultiplier: number,
    controlLower = centerline - controlMultiplier * sigma,
    controlUpper = centerline + controlMultiplier * sigma
): PointStatistics {
    return {
        centerline,
        sigma,
        lowerOne: centerline - sigma,
        upperOne: centerline + sigma,
        lowerTwo: centerline - 2 * sigma,
        upperTwo: centerline + 2 * sigma,
        lowerThree: centerline - 3 * sigma,
        upperThree: centerline + 3 * sigma,
        controlLower,
        controlUpper,
        ruleLower: controlLower,
        ruleUpper: controlUpper
    };
}

function individualsStatistics(values: number[], controlMultiplier: number): PointStatistics {
    const centerline = mean(values);
    const movingRanges = values.slice(1).map((value, index) => Math.abs(value - values[index]));
    const sigma = movingRanges.length === 0 ? 0 : mean(movingRanges) / INDIVIDUALS_CONSTANT;
    return createBands(centerline, sigma, controlMultiplier);
}

function movingRangeStatistics(values: number[], controlMultiplier: number): PointStatistics {
    const centerline = mean(values);
    const sigma = values.length === 0 ? 0 : centerline / d2(2);
    const controlSigma = centerline * (d4(2) - 1) / 3;
    return createBands(
        centerline,
        sigma,
        controlMultiplier,
        Math.max(0, centerline - controlMultiplier * controlSigma),
        centerline + controlMultiplier * controlSigma
    );
}

function runStatistics(values: number[], controlMultiplier: number): PointStatistics {
    return createBands(median(values), 0, controlMultiplier);
}

function pStatistics(rows: ChartRow[], controlMultiplier: number): PointStatistics {
    const denominatorTotal = rows.reduce((sum, row) => sum + (row.denominator ?? 0), 0);
    const numeratorTotal = rows.reduce((sum, row) => sum + rawValue(row), 0);
    const centerline = denominatorTotal > 0 ? numeratorTotal / denominatorTotal : 0;
    return createBands(centerline, Math.sqrt(Math.max(centerline * (1 - centerline), 0)), controlMultiplier);
}

function uStatistics(rows: ChartRow[], controlMultiplier: number): PointStatistics {
    const denominatorTotal = rows.reduce((sum, row) => sum + (row.denominator ?? 0), 0);
    const countTotal = rows.reduce((sum, row) => sum + rawValue(row), 0);
    const centerline = denominatorTotal > 0 ? countTotal / denominatorTotal : 0;
    return createBands(centerline, Math.sqrt(Math.max(centerline, 0)), controlMultiplier);
}

function cStatistics(rows: ChartRow[], controlMultiplier: number): PointStatistics {
    const centerline = mean(rows.map(rawValue));
    return createBands(centerline, Math.sqrt(Math.max(centerline, 0)), controlMultiplier);
}

function npStatistics(rows: ChartRow[], controlMultiplier: number): PointStatistics {
    const denominatorTotal = rows.reduce((sum, row) => sum + (row.denominator ?? 0), 0);
    const numeratorTotal = rows.reduce((sum, row) => sum + rawValue(row), 0);
    const centerline = denominatorTotal > 0 ? numeratorTotal / denominatorTotal : 0;
    return createBands(centerline, Math.sqrt(Math.max(centerline * (1 - centerline), 0)), controlMultiplier);
}

function xbarStatistics(rows: ChartRow[], controlMultiplier: number): PointStatistics {
    const weighted = rows.map((row) => ({ value: row.value, weight: subgroupSize(row) }));
    const centerline = weightedMean(weighted);
    const subgroupSDs = rows.map((row) => row.subgroupSD).filter(finite);
    const averageSize = mean(rows.map(subgroupSize));
    let sigma: number;
    if (subgroupSDs.length === rows.length && subgroupSDs.length > 0) {
        sigma = mean(subgroupSDs) / (c4(averageSize) * Math.sqrt(averageSize));
    } else {
        const movingRanges = rows.slice(1).map((row, index) => Math.abs(row.value - rows[index].value));
        sigma = movingRanges.length > 0
            ? mean(movingRanges) / (INDIVIDUALS_CONSTANT * Math.sqrt(averageSize))
            : 0;
    }
    return createBands(centerline, sigma, controlMultiplier);
}

function rStatistics(rows: ChartRow[], controlMultiplier: number): PointStatistics {
    const centerline = mean(rows.map((row) => row.value));
    const size = mean(rows.map(subgroupSize));
    return createBands(centerline, centerline / d2(size), controlMultiplier, d3(size) * centerline, d4(size) * centerline);
}

function sStatistics(rows: ChartRow[], controlMultiplier: number): PointStatistics {
    const centerline = mean(rows.map((row) => row.value));
    const size = mean(rows.map(subgroupSize));
    const c4Value = c4(size);
    const sigma = centerline * Math.sqrt(Math.max(1 - c4Value * c4Value, 0)) / c4Value;
    const constants = sConstants(size);
    return createBands(centerline, sigma, controlMultiplier, constants.lower * centerline, constants.upper * centerline);
}

function clampLimits(mode: ChartMode, statistics: PointStatistics, maximum?: number): PointStatistics {
    if (mode === "p") {
        return {
            ...statistics,
            lowerOne: Math.max(0, statistics.lowerOne),
            upperOne: Math.min(1, statistics.upperOne),
            lowerTwo: Math.max(0, statistics.lowerTwo),
            upperTwo: Math.min(1, statistics.upperTwo),
            lowerThree: Math.max(0, statistics.lowerThree),
            upperThree: Math.min(1, statistics.upperThree),
            controlLower: Math.max(0, statistics.controlLower),
            controlUpper: Math.min(1, statistics.controlUpper),
            ruleLower: Math.max(0, statistics.ruleLower ?? statistics.controlLower),
            ruleUpper: Math.min(1, statistics.ruleUpper ?? statistics.controlUpper)
        };
    }
    if (mode === "np") {
        return {
            ...statistics,
            lowerOne: Math.max(0, statistics.lowerOne),
            lowerTwo: Math.max(0, statistics.lowerTwo),
            lowerThree: Math.max(0, statistics.lowerThree),
            controlLower: Math.max(0, statistics.controlLower),
            ruleLower: Math.max(0, statistics.ruleLower ?? statistics.controlLower),
            ...(maximum === undefined
                ? {}
                : {
                    upperOne: Math.min(maximum, statistics.upperOne),
                    upperTwo: Math.min(maximum, statistics.upperTwo),
                    upperThree: Math.min(maximum, statistics.upperThree),
                    controlUpper: Math.min(maximum, statistics.controlUpper),
                    ruleUpper: Math.min(maximum, statistics.ruleUpper ?? statistics.controlUpper)
                })
        };
    }
    if (mode === "mr" || mode === "u" || mode === "c" || mode === "r" || mode === "s") {
        return {
            ...statistics,
            lowerOne: Math.max(0, statistics.lowerOne),
            lowerTwo: Math.max(0, statistics.lowerTwo),
            lowerThree: Math.max(0, statistics.lowerThree),
            controlLower: Math.max(0, statistics.controlLower),
            ruleLower: Math.max(0, statistics.ruleLower ?? statistics.controlLower),
            ruleUpper: statistics.ruleUpper
        };
    }
    return statistics;
}

function baseStatistics(
    mode: ChartMode,
    rows: ChartRow[],
    controlMultiplier: number
): PointStatistics {
    switch (mode) {
        case "individuals":
            return individualsStatistics(rows.map((row) => row.value), controlMultiplier);
        case "mr":
            return movingRangeStatistics(rows.map((row) => row.value), controlMultiplier);
        case "run":
            return runStatistics(rows.map((row) => row.value), controlMultiplier);
        case "p":
            return pStatistics(rows, controlMultiplier);
        case "np":
            return npStatistics(rows, controlMultiplier);
        case "u":
            return uStatistics(rows, controlMultiplier);
        case "c":
            return cStatistics(rows, controlMultiplier);
        case "xbar":
            return xbarStatistics(rows, controlMultiplier);
        case "r":
            return rStatistics(rows, controlMultiplier);
        case "s":
            return sStatistics(rows, controlMultiplier);
    }
}

function pointStatistics(
    mode: ChartMode,
    row: ChartRow,
    segmentStatistics: PointStatistics,
    controlMultiplier: number,
    averageSubgroupSize?: number
): PointStatistics {
    if (mode === "p") {
        const denominator = row.denominator ?? 0;
        const sigma = denominator > 0
            ? Math.sqrt(Math.max(segmentStatistics.centerline * (1 - segmentStatistics.centerline) / denominator, 0))
            : 0;
        return clampLimits(mode, createBands(segmentStatistics.centerline, sigma, controlMultiplier));
    }
    if (mode === "u") {
        const denominator = row.denominator ?? 0;
        const sigma = denominator > 0
            ? Math.sqrt(Math.max(segmentStatistics.centerline / denominator, 0))
            : 0;
        return clampLimits(mode, createBands(segmentStatistics.centerline, sigma, controlMultiplier));
    }
    if (mode === "np") {
        const denominator = row.denominator ?? 0;
        const centerline = segmentStatistics.centerline * denominator;
        const sigma = Math.sqrt(Math.max(segmentStatistics.centerline * (1 - segmentStatistics.centerline) * denominator, 0));
        return clampLimits(mode, createBands(centerline, sigma, controlMultiplier), denominator);
    }
    if (mode === "xbar") {
        const averageSize = subgroupSize(row);
        const sigma = finite(row.subgroupSD)
            ? row.subgroupSD / (c4(averageSize) * Math.sqrt(averageSize))
            : segmentStatistics.sigma * Math.sqrt(
                (averageSubgroupSize ?? averageSize) / averageSize
            );
        return createBands(segmentStatistics.centerline, sigma, controlMultiplier);
    }
    if (mode === "r") {
        const size = subgroupSize(row);
        const centerline = segmentStatistics.centerline;
        return clampLimits(
            mode,
            createBands(centerline, centerline / d2(size), controlMultiplier, d3(size) * centerline, d4(size) * centerline)
        );
    }
    if (mode === "s") {
        const size = subgroupSize(row);
        const centerline = segmentStatistics.centerline;
        const c4Value = c4(size);
        const sigma = centerline * Math.sqrt(Math.max(1 - c4Value * c4Value, 0)) / c4Value;
        const constants = sConstants(size);
        return clampLimits(mode, createBands(centerline, sigma, controlMultiplier, constants.lower * centerline, constants.upper * centerline));
    }
    return clampLimits(mode, segmentStatistics);
}

function language(locale: string | undefined): string {
    return (locale ?? "en").toLowerCase().split(/[-_]/)[0];
}

function formulaFor(mode: ChartMode, locale?: string): string {
    const localized = language(locale);
    if (localized === "es" && mode === "run") {
        return "Gráfico de corridas convencional: LC = mediana(x); sin límites de control estadístico; solo reglas de cambio y tendencia";
    }
    if (localized === "fr" && mode === "run") {
        return "Carte de tendances conventionnelle : LC = médiane(x); pas de limites de contrôle de statistique; règles de décalage et de tendance uniquement";
    }
    if (localized === "de" && mode === "run") {
        return "Konventionelle Run-Karte: ML = Median(x); keine statistischen Regelgrenzen; nur Verschiebungs- und Trendregeln";
    }
    if (localized === "ar" && mode === "run") {
        return "مخطط تشغيل تقليدي: CL = وسيط(x)؛ بلا حدود تحكم إحصائية؛ قواعد التحول والاتجاه فقط";
    }
    switch (mode) {
        case "individuals":
            return "CL = mean(x); MR = |x[i] - x[i-1]|; sigma = mean(MR) / 1.128; limits = CL +/- k sigma";
        case "run":
            return "Conventional run chart: CL = median(x); no statistical control limits; shift and trend rules only";
        case "mr":
            return "MR[i] = |x[i] - x[i-1]|; CL = mean(MR); sigma = MRbar / d2(2); control limits use D3/D4 scaled by k";
        case "xbar":
            return "Xbar: CL = weighted mean(x); sigma = sbar / (c4(n) sqrt(n)) or MRbar / (1.128 sqrt(n)); limits = CL +/- k sigma";
        case "r":
            return "R: CL = mean(R); LCL = D3(n) CL; UCL = D4(n) CL";
        case "s":
            return "S: CL = mean(S); LCL = B3(n) CL; UCL = B4(n) CL";
        case "p":
            return "p[i] = numerator[i] / denominator[i]; pbar = sum(numerator) / sum(denominator); sigma[i] = sqrt(pbar(1-pbar) / denominator[i])";
        case "np":
            return "np[i] = pbar denominator[i]; pbar = sum(numerator) / sum(denominator); sigma[i] = sqrt(pbar(1-pbar) denominator[i])";
        case "u":
            return "u[i] = count[i] / exposure[i]; ubar = sum(count) / sum(exposure); sigma[i] = sqrt(ubar / exposure[i])";
        case "c":
            return "CL = mean(count); sigma = sqrt(CL); LCL = max(0, CL - k sigma)";
    }
}

function specificationStatus(
    value: number,
    lower: number | undefined,
    upper: number | undefined
): CalculatedPoint["specificationStatus"] {
    if (finite(lower) && finite(upper) && lower > upper) {
        return "notConfigured";
    }
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

function compareSortKeys(left: ChartRow, right: ChartRow): number {
    const leftKey = left.timeSortKey;
    const rightKey = right.timeSortKey;
    if (typeof leftKey === "number" && typeof rightKey === "number" && leftKey !== rightKey) {
        return leftKey - rightKey;
    }
    if (leftKey !== undefined && rightKey !== undefined && leftKey !== rightKey) {
        return String(leftKey).localeCompare(String(rightKey), undefined, {
            numeric: true,
            sensitivity: "base"
        });
    }
    return left.index - right.index;
}

function orderedRows(rows: ChartRow[]): ChartRow[] {
    return rows
        .map((row, order) => ({ row, order }))
        .sort((left, right) => compareSortKeys(left.row, right.row) || left.order - right.order)
        .map(({ row }) => row);
}

function pointKeyFor(row: ChartRow): string {
    return row.pointKey ?? `${row.seriesKey}\u001f${row.baselineKey}\u001f${row.index}`;
}

function normalizeRow(mode: ChartMode, row: ChartRow): ChartRow {
    const raw = rawValue(row);
    const plotValue = mode === "p" || mode === "u"
        ? raw / (row.denominator ?? Number.NaN)
        : raw;
    return {
        ...row,
        value: plotValue,
        rawValue: raw,
        pointKey: pointKeyFor(row)
    };
}

function movingRangeRows(rows: ChartRow[]): ChartRow[] {
    const derived: ChartRow[] = [];
    let previous: ChartRow | undefined;
    for (const row of rows) {
        if (!previous || row.baselineKey !== previous.baselineKey) {
            previous = row;
            continue;
        }
        const movingRange = Math.abs(row.value - previous.value);
        derived.push({
            ...row,
            value: movingRange,
            rawValue: movingRange,
            subgroupSD: undefined,
            pointKey: `${pointKeyFor(row)}\u001fmr`
        });
        previous = row;
    }
    return derived;
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
    const byKey = new Map(points.map((point) => [point.pointKey ?? pointKeyFor(point), point]));
    for (const alarm of alarms) {
        for (const key of alarm.pointKeys) {
            const point = byKey.get(key);
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
    const controlMultiplier = multiplier(options.sigmaMultiplier, DEFAULT_SIGMA_MULTIPLIER);
    const points: CalculatedPoint[] = [];
    const ordered = orderedRows(rows);
    const sourceRows = options.mode === "mr" ? movingRangeRows(ordered) : ordered;
    const normalizedRows = sourceRows.map((row) => normalizeRow(options.mode, row));
    const segments = contiguousSegments(normalizedRows);
    for (const segment of segments) {
        const segmentStatistics = baseStatistics(options.mode, segment, controlMultiplier);
        const averageSubgroupSize = options.mode === "xbar"
            ? mean(segment.map(subgroupSize))
            : undefined;
        for (const row of segment) {
            const statistics = pointStatistics(
                options.mode,
                row,
                segmentStatistics,
                controlMultiplier,
                averageSubgroupSize
            );
            const plotValue = row.value;
            points.push({
                ...row,
                ...statistics,
                value: plotValue,
                plotValue,
                rawValue: row.rawValue ?? row.value,
                pointKey: pointKeyFor(row),
                specificationStatus: specificationStatus(
                    plotValue,
                    options.specificationLower,
                    options.specificationUpper
                ),
                alarms: []
            });
        }
    }
    const alarms = evaluateRules(points, {
        sigmaMultiplier: controlMultiplier,
        twoSigmaMultiplier: multiplier(options.twoSigmaMultiplier, DEFAULT_TWO_SIGMA_MULTIPLIER),
        shiftLength: options.shiftLength,
        trendLength: options.trendLength,
        resetOnBaselineChange: !options.joinRebaselineRules,
        enableOutside3Sigma: options.enableOutside3Sigma,
        enableTwoOfThree: options.enableTwoOfThree,
        enableShift: options.enableShift,
        enableTrend: options.enableTrend,
        mode: options.mode,
        locale: options.locale
    } satisfies RuleOptions);
    annotateAlarms(points, alarms);
    return { points, alarms };
}

function validTime(row: ChartRow): boolean {
    return typeof row.time === "string" && row.time.trim() !== "" &&
        (row.timeSortKey === undefined ||
            (typeof row.timeSortKey === "number" && Number.isFinite(row.timeSortKey)) ||
            (typeof row.timeSortKey === "string" && row.timeSortKey.trim() !== ""));
}

export function calculateChart(rows: ChartRow[], options: CalculationOptions): ChartResult {
    const validRows = rows.filter((row) =>
        validTime(row) &&
        validateRow(options.mode, rawValue(row), row.denominator, row.subgroupSD)
    );
    const seriesKeys = [...new Set(validRows.map((row) => row.seriesKey))];
    const allPoints: CalculatedPoint[] = [];
    const allAlarms: Alarm[] = [];
    for (const seriesKey of seriesKeys) {
        const seriesRows = validRows.filter((row) => row.seriesKey === seriesKey);
        const calculated = calculateSeries(seriesRows, options);
        allPoints.push(...calculated.points);
        allAlarms.push(...calculated.alarms);
    }
    return {
        mode: options.mode,
        points: allPoints,
        alarms: allAlarms,
        series: seriesKeys,
        formula: formulaFor(options.mode, options.locale),
        droppedRows: rows.length - validRows.length,
        receivedRows: rows.length,
        hasHighlights: validRows.some((row) => row.highlighted !== undefined),
        dataStatus: allPoints.length === 0 && validRows.length > 0 ? "empty" : "complete",
        hasMoreData: false,
        specificationLower: options.specificationLower,
        specificationUpper: options.specificationUpper
    };
}

export function validateRow(
    mode: ChartMode,
    value: unknown,
    denominator: unknown,
    subgroupSD?: unknown
): boolean {
    if (!finite(value)) {
        return false;
    }
    if (mode === "p" || mode === "u" || mode === "np") {
        if (!finite(denominator) || denominator <= 0) {
            return false;
        }
    }
    if (mode === "p" || mode === "np") {
        if (value < 0 || !finite(denominator) || value > denominator) {
            return false;
        }
    }
    if (mode === "u" || mode === "c" || mode === "r" || mode === "s") {
        if (value < 0) {
            return false;
        }
    }
    if (mode === "xbar" && finite(denominator) && denominator <= 0) {
        return false;
    }
    if ((mode === "r" || mode === "s") && finite(denominator) && denominator < 2) {
        return false;
    }
    if (mode === "xbar" && subgroupSD !== undefined && (!finite(subgroupSD) || subgroupSD < 0)) {
        return false;
    }
    return true;
}
