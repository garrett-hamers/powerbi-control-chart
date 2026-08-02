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

function multiplier(value: number | undefined, fallback: number, minimum = 0): number {
    return finite(value) && value >= minimum ? value : fallback;
}

function rawValue(row: ChartRow): number {
    return row.rawValue ?? row.value;
}

function createBands(centerline: number, sigma: number, controlMultiplier: number): PointStatistics {
    return {
        centerline,
        sigma,
        lowerOne: centerline - sigma,
        upperOne: centerline + sigma,
        lowerTwo: centerline - 2 * sigma,
        upperTwo: centerline + 2 * sigma,
        lowerThree: centerline - 3 * sigma,
        upperThree: centerline + 3 * sigma,
        controlLower: centerline - controlMultiplier * sigma,
        controlUpper: centerline + controlMultiplier * sigma
    };
}

function individualsStatistics(values: number[], controlMultiplier: number): PointStatistics {
    const centerline = mean(values);
    const movingRanges = values.slice(1).map((value, index) => Math.abs(value - values[index]));
    const sigma = movingRanges.length === 0 ? 0 : mean(movingRanges) / INDIVIDUALS_CONSTANT;
    return createBands(centerline, sigma, controlMultiplier);
}

function runStatistics(values: number[], controlMultiplier: number): PointStatistics {
    // A conventional run chart has a median centerline and no estimated control limits.
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

function clampLimits(mode: ChartMode, statistics: PointStatistics): PointStatistics {
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
            controlUpper: Math.min(1, statistics.controlUpper)
        };
    }
    if (mode === "u" || mode === "c") {
        return {
            ...statistics,
            lowerOne: Math.max(0, statistics.lowerOne),
            lowerTwo: Math.max(0, statistics.lowerTwo),
            lowerThree: Math.max(0, statistics.lowerThree),
            controlLower: Math.max(0, statistics.controlLower)
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
        case "run":
            return runStatistics(rows.map((row) => row.value), controlMultiplier);
        case "p":
            return pStatistics(rows, controlMultiplier);
        case "u":
            return uStatistics(rows, controlMultiplier);
        case "c":
            return cStatistics(rows, controlMultiplier);
    }
}

function pointStatistics(
    mode: ChartMode,
    row: ChartRow,
    segmentStatistics: PointStatistics,
    controlMultiplier: number
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
    return clampLimits(mode, segmentStatistics);
}

function language(locale: string | undefined): string {
    return (locale ?? "en").toLowerCase().split(/[-_]/)[0];
}

function formulaFor(mode: ChartMode, locale?: string): string {
    const localized = language(locale);
    if (localized === "es") {
        switch (mode) {
            case "individuals":
                return "LC = media(x); MR = |x[i] - x[i-1]|; sigma = media(MR) / 1.128; límites = LC +/- k sigma";
            case "run":
                return "Gráfico de corridas convencional: LC = mediana(x); sin límites de control estadístico; solo reglas de cambio y tendencia";
            case "p":
                return "p[i] = numerador[i] / denominador[i]; pbar = suma(numerador) / suma(denominador); sigma[i] = sqrt(pbar(1-pbar) / denominador[i])";
            case "u":
                return "u[i] = conteo[i] / exposición[i]; ubar = suma(conteo) / suma(exposición); sigma[i] = sqrt(ubar / exposición[i])";
            case "c":
                return "LC = media(conteo); sigma = sqrt(LC); LCL = max(0, LC - k sigma)";
        }
    }
    if (localized === "fr") {
        switch (mode) {
            case "individuals":
                return "LC = moyenne(x); MR = |x[i] - x[i-1]|; sigma = moyenne(MR) / 1.128; limites = LC +/- k sigma";
            case "run":
                return "Carte de tendances conventionnelle : LC = médiane(x); pas de limites de contrôle statistique; règles de décalage et de tendance uniquement";
            case "p":
                return "p[i] = numérateur[i] / dénominateur[i]; pbar = somme(numérateur) / somme(dénominateur); sigma[i] = sqrt(pbar(1-pbar) / dénominateur[i])";
            case "u":
                return "u[i] = compte[i] / exposition[i]; ubar = somme(compte) / somme(exposition); sigma[i] = sqrt(ubar / exposition[i])";
            case "c":
                return "LC = moyenne(compte); sigma = sqrt(LC); LCL = max(0, LC - k sigma)";
        }
    }
    if (localized === "de") {
        switch (mode) {
            case "individuals":
                return "ML = Mittelwert(x); MR = |x[i] - x[i-1]|; Sigma = Mittelwert(MR) / 1.128; Grenzen = ML +/- k Sigma";
            case "run":
                return "Konventionelle Run-Karte: ML = Median(x); keine statistischen Regelgrenzen; nur Verschiebungs- und Trendregeln";
            case "p":
                return "p[i] = Zähler[i] / Nenner[i]; pbar = Summe(Zähler) / Summe(Nenner); Sigma[i] = sqrt(pbar(1-pbar) / Nenner[i])";
            case "u":
                return "u[i] = Anzahl[i] / Exposition[i]; ubar = Summe(Anzahl) / Summe(Exposition); Sigma[i] = sqrt(ubar / Exposition[i])";
            case "c":
                return "ML = Mittelwert(Anzahl); Sigma = sqrt(ML); LCL = max(0, ML - k Sigma)";
        }
    }
    if (localized === "ar") {
        switch (mode) {
            case "individuals":
                return "CL = متوسط(x)؛ MR = |x[i] - x[i-1]|؛ سيغما = متوسط(MR) / 1.128؛ الحدود = CL +/- k سيغما";
            case "run":
                return "مخطط تشغيل تقليدي: CL = وسيط(x)؛ بلا حدود تحكم إحصائية؛ قواعد التحول والاتجاه فقط";
            case "p":
                return "p[i] = البسط[i] / المقام[i]؛ pbar = مجموع(البسط) / مجموع(المقام)؛ sigma[i] = sqrt(pbar(1-pbar) / المقام[i])";
            case "u":
                return "u[i] = العدد[i] / التعرض[i]؛ ubar = مجموع(العدد) / مجموع(التعرض)؛ sigma[i] = sqrt(ubar / التعرض[i])";
            case "c":
                return "CL = متوسط(العدد)؛ sigma = sqrt(CL)؛ LCL = max(0, CL - k sigma)";
        }
    }
    switch (mode) {
        case "individuals":
            return "CL = mean(x); MR = |x[i] - x[i-1]|; sigma = mean(MR) / 1.128; limits = CL +/- k sigma";
        case "run":
            return "Conventional run chart: CL = median(x); no statistical control limits; shift and trend rules only";
        case "p":
            return "p[i] = numerator[i] / denominator[i]; pbar = sum(numerator) / sum(denominator); sigma[i] = sqrt(pbar(1-pbar) / denominator[i])";
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
    const normalized = mode === "p" || mode === "u"
        ? raw / (row.denominator ?? Number.NaN)
        : row.value;
    return {
        ...row,
        value: normalized,
        rawValue: raw,
        pointKey: pointKeyFor(row)
    };
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
    const normalizedRows = orderedRows(rows).map((row) => normalizeRow(options.mode, row));
    const segments = contiguousSegments(normalizedRows);
    for (const segment of segments) {
        const segmentStatistics = baseStatistics(options.mode, segment, controlMultiplier);
        for (const row of segment) {
            const statistics = pointStatistics(options.mode, row, segmentStatistics, controlMultiplier);
            points.push({
                ...row,
                ...statistics,
                rawValue: row.rawValue ?? row.value,
                pointKey: pointKeyFor(row),
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

export function calculateChart(rows: ChartRow[], options: CalculationOptions): ChartResult {
    const validRows = rows.filter((row) => validateRow(options.mode, rawValue(row), row.denominator));
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
        dataStatus: "complete",
        hasMoreData: false,
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
