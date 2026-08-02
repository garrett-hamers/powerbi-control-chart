import { Alarm, CalculatedPoint, RuleName, RuleOptions } from "./types";

function sideFor(value: number, point: CalculatedPoint, multiplier: number): "high" | "low" | undefined {
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

function explanation(rule: RuleName, side: Alarm["side"], windowStart: number, windowEnd: number): string {
    const window = windowStart === windowEnd
        ? `point ${windowStart + 1}`
        : `points ${windowStart + 1}–${windowEnd + 1}`;
    switch (rule) {
        case "outside3Sigma":
            return `The value is outside the 3 sigma control limit at ${window}; this is a special-cause signal, not proof of a root cause.`;
        case "twoOfThree":
            return `At least two of three consecutive values are beyond 2 sigma on the ${side === "high" ? "high" : "low"} side (${window}).`;
        case "shift":
            return `A run of consecutive values remains on the ${side === "high" ? "high" : "low"} side of the centerline (${window}).`;
        case "trend":
            return `Values move monotonically in one direction across ${window}; investigate the process before attributing a cause.`;
    }
}

function makeAlarm(
    rule: RuleName,
    points: CalculatedPoint[],
    pointIndex: number,
    pointIndices: number[],
    windowStart: number,
    windowEnd: number,
    side: Alarm["side"]
): Alarm {
    const point = points.find((candidate) => candidate.index === pointIndex) ?? points[0];
    const limit = rule === "twoOfThree"
        ? side === "low" ? point.lowerTwo : point.upperTwo
        : rule === "outside3Sigma"
            ? side === "low" ? point.lowerThree : point.upperThree
            : point.centerline;
    return {
        id: `${rule}:${point.seriesKey}:${windowStart}:${windowEnd}`,
        rule,
        seriesKey: point.seriesKey,
        seriesLabel: point.seriesLabel,
        pointIndex,
        pointIndices,
        windowStart,
        windowEnd,
        side,
        value: point.value,
        limit,
        centerline: point.centerline,
        baselineLabel: point.baselineLabel,
        explanation: explanation(rule, side, windowStart, windowEnd)
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

function outsideThreeSigma(points: CalculatedPoint[], _options: RuleOptions): Alarm[] {
    const alarms: Alarm[] = [];
    for (const point of points) {
        const side = sideFor(point.value, point, 3);
        if (!side) {
            continue;
        }
        alarms.push(makeAlarm(
            "outside3Sigma",
            points,
            point.index,
            [point.index],
            points.indexOf(point),
            points.indexOf(point),
            side
        ));
    }
    return alarms;
}

function twoOfThree(points: CalculatedPoint[]): Alarm[] {
    const alarms: Alarm[] = [];
    for (let end = 2; end < points.length; end += 1) {
        const window = points.slice(end - 2, end + 1);
        const high = window.filter((point) => point.value > point.centerline + 2 * point.sigma);
        const low = window.filter((point) => point.value < point.centerline - 2 * point.sigma);
        const matching = high.length >= 2 ? high : low.length >= 2 ? low : [];
        if (matching.length >= 2) {
            const side = high.length >= 2 ? "high" : "low";
            alarms.push(makeAlarm(
                "twoOfThree",
                points,
                points[end].index,
                matching.map((point) => point.index),
                end - 2,
                end,
                side
            ));
        }
    }
    return alarms;
}

function shift(points: CalculatedPoint[], options: RuleOptions): Alarm[] {
    const alarms: Alarm[] = [];
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
        if (end - start >= options.shiftLength) {
            const members = points.slice(start, end);
            alarms.push(makeAlarm(
                "shift",
                points,
                members[members.length - 1].index,
                members.map((point) => point.index),
                start,
                end - 1,
                firstSide
            ));
        }
        start = end;
    }
    return alarms;
}

function trend(points: CalculatedPoint[], options: RuleOptions): Alarm[] {
    const alarms: Alarm[] = [];
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
            if (direction && length >= options.trendLength) {
                const members = points.slice(start, index);
                alarms.push(makeAlarm(
                    "trend",
                    points,
                    members[members.length - 1].index,
                    members.map((point) => point.index),
                    start,
                    index - 1,
                    "both"
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
        alarms.push(...twoOfThree(segment));
        alarms.push(...shift(segment, options));
        alarms.push(...trend(segment, options));
    }
    return alarms;
}

export function ruleLabel(rule: RuleName): string {
    switch (rule) {
        case "outside3Sigma":
            return "Outside 3 sigma";
        case "twoOfThree":
            return "Two of three beyond 2 sigma";
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
