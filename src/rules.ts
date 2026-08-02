import { Alarm, CalculatedPoint, RuleName, RuleOptions } from "./types";

const DEFAULT_SIGMA_MULTIPLIER = 3;
const DEFAULT_TWO_SIGMA_MULTIPLIER = 2;

function pointKeyFor(point: CalculatedPoint): string {
    return point.pointKey ?? `${point.seriesKey}\u001f${point.baselineKey}\u001f${point.index}`;
}

function numericMultiplier(value: number | undefined, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function language(locale: string | undefined): string {
    return (locale ?? "en").toLowerCase().split(/[-_]/)[0];
}

function sideFor(
    value: number,
    point: CalculatedPoint,
    multiplier: number
): "high" | "low" | undefined {
    const high = point.centerline + multiplier * point.sigma;
    const low = point.centerline - multiplier * point.sigma;
    if (value > high) {
        return "high";
    }
    if (value < low) {
        return "low";
    }
    return undefined;
}

function explanation(
    rule: RuleName,
    side: Alarm["side"],
    windowStart: number,
    windowEnd: number,
    sigmaMultiplier: number,
    twoSigmaMultiplier: number,
    locale?: string
): string {
    const window = windowStart === windowEnd
        ? `point ${windowStart + 1}`
        : `points ${windowStart + 1}-${windowEnd + 1}`;
    const sideLabel = side === "high" ? "high" : "low";
    switch (language(locale)) {
        case "es":
            switch (rule) {
                case "outside3Sigma":
                    return `El valor está fuera del límite de control configurado de ${sigmaMultiplier} sigma en ${window}; es una señal de causa especial, no una prueba de causa raíz.`;
                case "twoOfThree":
                    return `Al menos dos de tres valores consecutivos superan ${twoSigmaMultiplier} sigma por el lado ${sideLabel === "high" ? "alto" : "bajo"} (${window}).`;
                case "shift":
                    return `Una secuencia de valores consecutivos permanece en el lado ${sideLabel === "high" ? "alto" : "bajo"} de la línea central (${window}).`;
                case "trend":
                    return `Los valores avanzan monótonamente en una dirección a través de ${window}; investigue el proceso antes de atribuir una causa.`;
            }
            break;
        case "fr":
            switch (rule) {
                case "outside3Sigma":
                    return `La valeur est hors de la limite de contrôle configurée à ${sigmaMultiplier} sigma au niveau de ${window}; il s'agit d'un signal de cause spéciale, pas d'une preuve de cause racine.`;
                case "twoOfThree":
                    return `Au moins deux valeurs sur trois dépassent ${twoSigmaMultiplier} sigma du côté ${sideLabel === "high" ? "haut" : "bas"} (${window}).`;
                case "shift":
                    return `Une suite de valeurs consécutives reste du côté ${sideLabel === "high" ? "haut" : "bas"} de la ligne centrale (${window}).`;
                case "trend":
                    return `Les valeurs évoluent de façon monotone dans une direction sur ${window}; examinez le processus avant d'attribuer une cause.`;
            }
            break;
        case "de":
            switch (rule) {
                case "outside3Sigma":
                    return `Der Wert liegt bei ${window} außerhalb der konfigurierten ${sigmaMultiplier}-Sigma-Regelgrenze; dies ist ein Signal für eine Sonderursache, kein Beweis für eine Grundursache.`;
                case "twoOfThree":
                    return `Mindestens zwei von drei aufeinanderfolgenden Werten liegen auf der ${sideLabel === "high" ? "hohen" : "niedrigen"} Seite mehr als ${twoSigmaMultiplier} Sigma entfernt (${window}).`;
                case "shift":
                    return `Eine Folge aufeinanderfolgender Werte bleibt auf der ${sideLabel === "high" ? "hohen" : "niedrigen"} Seite der Mittellinie (${window}).`;
                case "trend":
                    return `Die Werte bewegen sich über ${window} monoton in eine Richtung; untersuchen Sie den Prozess, bevor Sie eine Ursache annehmen.`;
            }
            break;
        case "ar":
            switch (rule) {
                case "outside3Sigma":
                    return `تقع القيمة خارج حد التحكم المضبوط عند ${sigmaMultiplier} سيغما في ${window}؛ هذه إشارة إلى سبب خاص وليست إثباتًا للسبب الجذري.`;
                case "twoOfThree":
                    return `تتجاوز قيمتان على الأقل من ثلاث قيم متتالية ${twoSigmaMultiplier} سيغما على الجانب ${sideLabel === "high" ? "الأعلى" : "الأدنى"} (${window}).`;
                case "shift":
                    return `تبقى سلسلة من القيم المتتالية على الجانب ${sideLabel === "high" ? "الأعلى" : "الأدنى"} من خط الوسط (${window}).`;
                case "trend":
                    return `تتحرك القيم بشكل رتيب في اتجاه واحد عبر ${window}؛ افحص العملية قبل عزو السبب.`;
            }
            break;
    }
    switch (rule) {
        case "outside3Sigma":
            return `The value is outside the configured ${sigmaMultiplier} sigma control limit at ${window}; this is a special-cause signal, not proof of a root cause.`;
        case "twoOfThree":
            return `At least two of three consecutive values are beyond ${twoSigmaMultiplier} sigma on the ${side === "high" ? "high" : "low"} side (${window}).`;
        case "shift":
            return `A run of consecutive values remains on the ${side === "high" ? "high" : "low"} side of the centerline (${window}).`;
        case "trend":
            return `Values move monotonically in one direction across ${window}; investigate the process before attributing a cause.`;
    }
}

function makeAlarm(
    rule: RuleName,
    points: CalculatedPoint[],
    point: CalculatedPoint,
    pointIndices: number[],
    pointKeys: string[],
    windowStart: number,
    windowEnd: number,
    side: Alarm["side"],
    options: RuleOptions
): Alarm {
    const controlMultiplier = numericMultiplier(options.sigmaMultiplier, DEFAULT_SIGMA_MULTIPLIER);
    const twoSigmaMultiplier = numericMultiplier(options.twoSigmaMultiplier, DEFAULT_TWO_SIGMA_MULTIPLIER);
    const limit = rule === "twoOfThree"
        ? side === "low"
            ? point.centerline - twoSigmaMultiplier * point.sigma
            : point.centerline + twoSigmaMultiplier * point.sigma
        : rule === "outside3Sigma"
            ? side === "low"
                ? point.centerline - controlMultiplier * point.sigma
                : point.centerline + controlMultiplier * point.sigma
            : point.centerline;
    return {
        id: `${rule}:${pointKeyFor(point)}:${windowStart}:${windowEnd}`,
        rule,
        seriesKey: point.seriesKey,
        seriesLabel: point.seriesLabel,
        pointKey: pointKeyFor(point),
        pointKeys,
        pointIndex: point.index,
        pointIndices,
        windowStart,
        windowEnd,
        side,
        value: point.value,
        limit,
        centerline: point.centerline,
        baselineLabel: point.baselineLabel,
        explanation: explanation(
            rule,
            side,
            windowStart,
            windowEnd,
            controlMultiplier,
            twoSigmaMultiplier,
            options.locale
        )
    };
}

function splitForBaseline(points: CalculatedPoint[], reset: boolean): CalculatedPoint[][] {
    if (!reset || points.length === 0) {
        return [points];
    }
    const segments: CalculatedPoint[][] = [];
    let segment: CalculatedPoint[] = [];
    let baseline = points[0].baselineKey;
    for (const point of points) {
        if (segment.length > 0 && point.baselineKey !== baseline) {
            segments.push(segment);
            segment = [];
            baseline = point.baselineKey;
        }
        segment.push(point);
    }
    if (segment.length > 0) {
        segments.push(segment);
    }
    return segments;
}

function outsideThreeSigma(points: CalculatedPoint[], options: RuleOptions): Alarm[] {
    if (options.mode === "run" || options.enableOutside3Sigma === false) {
        return [];
    }
    const alarms: Alarm[] = [];
    const controlMultiplier = numericMultiplier(options.sigmaMultiplier, DEFAULT_SIGMA_MULTIPLIER);
    for (const point of points) {
        const side = sideFor(point.value, point, controlMultiplier);
        if (!side) {
            continue;
        }
        const key = pointKeyFor(point);
        alarms.push(makeAlarm(
            "outside3Sigma",
            points,
            point,
            [point.index],
            [key],
            points.indexOf(point),
            points.indexOf(point),
            side,
            options
        ));
    }
    return alarms;
}

function twoOfThree(points: CalculatedPoint[], options: RuleOptions): Alarm[] {
    if (options.mode === "run" || options.enableTwoOfThree === false) {
        return [];
    }
    const alarms: Alarm[] = [];
    const twoSigmaMultiplier = numericMultiplier(options.twoSigmaMultiplier, DEFAULT_TWO_SIGMA_MULTIPLIER);
    for (let end = 2; end < points.length; end += 1) {
        const window = points.slice(end - 2, end + 1);
        const high = window.filter((point) => point.value > point.centerline + twoSigmaMultiplier * point.sigma);
        const low = window.filter((point) => point.value < point.centerline - twoSigmaMultiplier * point.sigma);
        const matching = high.length >= 2 ? high : low.length >= 2 ? low : [];
        if (matching.length >= 2) {
            const side = high.length >= 2 ? "high" : "low";
            alarms.push(makeAlarm(
                "twoOfThree",
                points,
                points[end],
                matching.map((point) => point.index),
                matching.map(pointKeyFor),
                end - 2,
                end,
                side,
                options
            ));
        }
    }
    return alarms;
}

function shift(points: CalculatedPoint[], options: RuleOptions): Alarm[] {
    if (options.enableShift === false) {
        return [];
    }
    const alarms: Alarm[] = [];
    const shiftLength = Math.max(2, Math.floor(options.shiftLength));
    let start = 0;
    while (start < points.length) {
        const firstSide = points[start].value > points[start].centerline
            ? "high"
            : points[start].value < points[start].centerline
                ? "low"
                : undefined;
        if (!firstSide) {
            start += 1;
            continue;
        }
        let end = start + 1;
        while (
            end < points.length &&
            ((firstSide === "high" && points[end].value > points[end].centerline) ||
                (firstSide === "low" && points[end].value < points[end].centerline))
        ) {
            end += 1;
        }
        if (end - start >= shiftLength) {
            const members = points.slice(start, end);
            alarms.push(makeAlarm(
                "shift",
                points,
                members[members.length - 1],
                members.map((point) => point.index),
                members.map(pointKeyFor),
                start,
                end - 1,
                firstSide,
                options
            ));
        }
        start = end;
    }
    return alarms;
}

function trend(points: CalculatedPoint[], options: RuleOptions): Alarm[] {
    if (options.enableTrend === false) {
        return [];
    }
    const alarms: Alarm[] = [];
    const trendLength = Math.max(3, Math.floor(options.trendLength));
    if (points.length < 2) {
        return alarms;
    }
    let start = 0;
    let direction: "up" | "down" | undefined;
    for (let index = 1; index <= points.length; index += 1) {
        const previous = points[index - 1];
        const current = points[index];
        const nextDirection = current
            ? current.value > previous.value
                ? "up"
                : current.value < previous.value
                    ? "down"
                    : undefined
            : undefined;
        if (!nextDirection || (direction && nextDirection !== direction)) {
            const length = index - start;
            if (direction && length >= trendLength) {
                const members = points.slice(start, index);
                alarms.push(makeAlarm(
                    "trend",
                    points,
                    members[members.length - 1],
                    members.map((point) => point.index),
                    members.map(pointKeyFor),
                    start,
                    index - 1,
                    "both",
                    options
                ));
            }
            start = index - (nextDirection ? 1 : 0);
            direction = nextDirection;
        } else if (!direction) {
            start = index - 1;
            direction = nextDirection;
        }
    }
    return alarms;
}

export function evaluateRules(points: CalculatedPoint[], options: RuleOptions): Alarm[] {
    const alarms: Alarm[] = [];
    for (const segment of splitForBaseline(points, options.resetOnBaselineChange)) {
        alarms.push(...outsideThreeSigma(segment, options));
        alarms.push(...twoOfThree(segment, options));
        alarms.push(...shift(segment, options));
        alarms.push(...trend(segment, options));
    }
    return alarms;
}

export function ruleLabel(rule: RuleName): string {
    switch (rule) {
        case "outside3Sigma":
            return "Outside configured sigma limit";
        case "twoOfThree":
            return "Two of three beyond configured sigma";
        case "shift":
            return "Shift";
        case "trend":
            return "Trend";
    }
}

export function alarmIsVisible(
    alarm: Alarm,
    direction: "both" | "higherIsBetter" | "lowerIsBetter" | "neutral"
): boolean {
    if (direction === "both" || direction === "neutral" || alarm.side === "both") {
        return true;
    }
    if (direction === "higherIsBetter") {
        return alarm.side === "low";
    }
    return alarm.side === "high";
}
