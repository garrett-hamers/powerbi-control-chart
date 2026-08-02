import { Alarm, ChartMode, Direction, SpecificationStatus } from "./types";
import { ruleLabel } from "./rules";

type LocaleKey =
    | "title"
    | "noData"
    | "missingDenominator"
    | "allInvalid"
    | "renderingFailed"
    | "partialData"
    | "incompleteData"
    | "rows"
    | "latest"
    | "centerline"
    | "limits"
    | "alarms"
    | "direction"
    | "control"
    | "runSemantics"
    | "oneSigma"
    | "twoSigma"
    | "threeSigma"
    | "specificationLower"
    | "specificationUpper"
    | "withinSpecification"
    | "belowSpecification"
    | "aboveSpecification"
    | "noAlarms"
    | "alarmTable"
    | "time"
    | "value"
    | "denominator"
    | "numerator"
    | "count"
    | "series"
    | "baseline"
    | "lowerControl"
    | "upperControl"
    | "sigma"
    | "side"
    | "limit"
    | "notApplicable"
    | "rule"
    | "explanation"
    | "point"
    | "formula"
    | "enterData";

const translations: Record<string, Partial<Record<LocaleKey, string>>> = {
    es: {
        title: "Gráfico de control Atlyn",
        noData: "Agregue Tiempo y Valor para comenzar.",
        missingDenominator: "Este modo requiere un denominador positivo.",
        allInvalid: "No hay filas válidas para este modo.",
        renderingFailed: "No se pudo representar el gráfico.",
        partialData: "Se omitieron filas no válidas.",
        incompleteData: "Datos parciales.",
        latest: "Último",
        centerline: "Línea central",
        limits: "Límites de control",
        alarms: "alarmas",
        direction: "Dirección",
        control: "Control",
        runSemantics: "Gráfico de corridas convencional; solo reglas de cambio y tendencia",
        oneSigma: "1 sigma",
        twoSigma: "2 sigma",
        threeSigma: "3 sigma",
        noAlarms: "Sin alarmas activas",
        alarmTable: "Resumen de alarmas accesible",
        time: "Tiempo",
        value: "Valor",
        denominator: "Denominador",
        numerator: "Numerador",
        count: "Conteo",
        series: "Serie",
        baseline: "Base",
        lowerControl: "Límite inferior de control",
        upperControl: "Límite superior de control",
        sigma: "Sigma",
        side: "Lado",
        limit: "Límite",
        notApplicable: "No aplicable",
        rule: "Regla",
        explanation: "Explicación",
        point: "Punto",
        formula: "Fórmula",
        enterData: "Agregue datos válidos para este modo."
    },
    fr: {
        title: "Carte de contrôle Atlyn",
        noData: "Ajoutez Temps et Valeur pour commencer.",
        missingDenominator: "Ce mode nécessite un dénominateur positif.",
        allInvalid: "Aucune ligne valide pour ce mode.",
        renderingFailed: "Le graphique n'a pas pu être rendu.",
        partialData: "Des lignes invalides ont été ignorées.",
        incompleteData: "Données partielles.",
        latest: "Dernière",
        centerline: "Ligne centrale",
        limits: "Limites de contrôle",
        alarms: "alarmes",
        direction: "Direction",
        control: "Contrôle",
        runSemantics: "Carte de tendances conventionnelle; règles de décalage et de tendance uniquement",
        oneSigma: "1 sigma",
        twoSigma: "2 sigma",
        threeSigma: "3 sigma",
        noAlarms: "Aucune alarme active",
        alarmTable: "Résumé accessible des alarmes",
        time: "Temps",
        value: "Valeur",
        denominator: "Dénominateur",
        numerator: "Numérateur",
        count: "Compte",
        series: "Série",
        baseline: "Base",
        lowerControl: "Limite de contrôle inférieure",
        upperControl: "Limite de contrôle supérieure",
        sigma: "Sigma",
        side: "Côté",
        limit: "Limite",
        notApplicable: "Non applicable",
        rule: "Règle",
        explanation: "Explication",
        point: "Point",
        formula: "Formule",
        enterData: "Ajoutez des données valides pour ce mode."
    },
    de: {
        title: "Atlyn Regelkarte",
        noData: "Fügen Sie Zeit und Wert hinzu.",
        missingDenominator: "Dieser Modus benötigt einen positiven Nenner.",
        allInvalid: "Keine gültigen Zeilen für diesen Modus.",
        renderingFailed: "Das Diagramm konnte nicht dargestellt werden.",
        partialData: "Ungültige Zeilen wurden ausgelassen.",
        incompleteData: "Unvollständige Daten.",
        latest: "Letzter",
        centerline: "Mittellinie",
        limits: "Regelgrenzen",
        alarms: "Alarme",
        direction: "Richtung",
        control: "Regelung",
        runSemantics: "Konventionelles Run-Chart; nur Verschiebungs- und Trendregeln",
        oneSigma: "1 Sigma",
        twoSigma: "2 Sigma",
        threeSigma: "3 Sigma",
        noAlarms: "Keine aktiven Alarme",
        alarmTable: "Barrierefreie Alarmübersicht",
        time: "Zeit",
        value: "Wert",
        denominator: "Nenner",
        numerator: "Zähler",
        count: "Anzahl",
        series: "Serie",
        baseline: "Basis",
        lowerControl: "Untere Regelgrenze",
        upperControl: "Obere Regelgrenze",
        sigma: "Sigma",
        side: "Seite",
        limit: "Grenze",
        notApplicable: "Nicht zutreffend",
        rule: "Regel",
        explanation: "Erklärung",
        point: "Punkt",
        formula: "Formel",
        enterData: "Fügen Sie gültige Daten für diesen Modus hinzu."
    },
    ar: {
        title: "مخطط التحكم من Atlyn",
        noData: "أضف الوقت والقيمة للبدء.",
        missingDenominator: "يتطلب هذا الوضع مقامًا موجبًا.",
        allInvalid: "لا توجد صفوف صالحة لهذا الوضع.",
        renderingFailed: "تعذر عرض المخطط.",
        partialData: "تم تجاهل الصفوف غير الصالحة.",
        incompleteData: "بيانات جزئية.",
        latest: "الأحدث",
        centerline: "خط الوسط",
        limits: "حدود التحكم",
        alarms: "تنبيهات",
        direction: "الاتجاه",
        control: "التحكم",
        runSemantics: "مخطط تشغيل تقليدي؛ قواعد التحول والاتجاه فقط",
        oneSigma: "سيغما 1",
        twoSigma: "سيغما 2",
        threeSigma: "سيغما 3",
        noAlarms: "لا توجد تنبيهات نشطة",
        alarmTable: "ملخص التنبيهات الميسر",
        time: "الوقت",
        value: "القيمة",
        denominator: "المقام",
        numerator: "البسط",
        count: "العدد",
        series: "السلسلة",
        baseline: "الخط الأساسي",
        lowerControl: "حد التحكم الأدنى",
        upperControl: "حد التحكم الأعلى",
        sigma: "سيغما",
        side: "الجانب",
        limit: "الحد",
        notApplicable: "غير منطبق",
        rule: "القاعدة",
        explanation: "التفسير",
        point: "النقطة",
        formula: "الصيغة",
        enterData: "أضف بيانات صالحة لهذا الوضع."
    }
};

function language(locale: string | undefined): string {
    return (locale ?? "en").toLowerCase().split(/[-_]/)[0];
}

export function t(key: LocaleKey, locale?: string): string {
    return translations[language(locale)]?.[key] ?? translations.en?.[key] ?? english[key];
}

const english: Record<LocaleKey, string> = {
    title: "Atlyn Control Chart",
    noData: "Add Time and Value fields to begin.",
    missingDenominator: "P and U modes require a positive Denominator field.",
    allInvalid: "No valid rows are available for this mode.",
    renderingFailed: "The chart could not be rendered.",
    partialData: "Invalid rows were omitted.",
    incompleteData: "Partial data.",
    rows: "rows",
    latest: "Latest",
    centerline: "Centerline",
    limits: "Control limits",
    alarms: "alarms",
    direction: "Direction",
    control: "Control",
    runSemantics: "Conventional run chart; shift and trend rules only",
    oneSigma: "1 sigma",
    twoSigma: "2 sigma",
    threeSigma: "3 sigma",
    specificationLower: "LSL",
    specificationUpper: "USL",
    withinSpecification: "Within specification",
    belowSpecification: "Below specification",
    aboveSpecification: "Above specification",
    noAlarms: "No active alarms",
    alarmTable: "Accessible alarm summary",
    time: "Time",
    value: "Value",
    denominator: "Denominator",
    numerator: "Numerator",
    count: "Count",
    series: "Series",
    baseline: "Baseline",
    lowerControl: "Lower control limit",
    upperControl: "Upper control limit",
    sigma: "Sigma",
    side: "Side",
    limit: "Limit",
    notApplicable: "Not applicable",
    rule: "Rule",
    explanation: "Explanation",
    point: "Point",
    formula: "Formula",
    enterData: "Add valid data for this mode."
};

export function modeLabel(mode: ChartMode, locale?: string): string {
    const labels: Record<ChartMode, string> = {
        individuals: "Individuals",
        run: "Run",
        p: "P",
        u: "U",
        c: "C"
    };
    if (language(locale) === "es") {
        return mode === "individuals" ? "Individuales" : mode === "run" ? "Corrida" : labels[mode];
    }
    if (language(locale) === "fr") {
        return mode === "individuals" ? "Individus" : mode === "run" ? "Série" : labels[mode];
    }
    if (language(locale) === "de") {
        return mode === "individuals" ? "Einzelwerte" : mode === "run" ? "Lauf" : labels[mode];
    }
    if (language(locale) === "ar") {
        return mode === "individuals" ? "الأفراد" : mode === "run" ? "التشغيل" : labels[mode];
    }
    return labels[mode];
}

export function directionLabel(direction: Direction, locale?: string): string {
    const labels: Record<Direction, string> = {
        both: "Show both sides",
        higherIsBetter: "Higher is better",
        lowerIsBetter: "Lower is better",
        neutral: "Neutral"
    };
    if (language(locale) === "es") {
        return {
            both: "Mostrar ambos lados",
            higherIsBetter: "Más alto es mejor",
            lowerIsBetter: "Más bajo es mejor",
            neutral: "Neutral"
        }[direction];
    }
    if (language(locale) === "fr") {
        return {
            both: "Afficher les deux côtés",
            higherIsBetter: "Plus haut est préférable",
            lowerIsBetter: "Plus bas est préférable",
            neutral: "Neutre"
        }[direction];
    }
    if (language(locale) === "de") {
        return {
            both: "Beide Seiten anzeigen",
            higherIsBetter: "Höher ist besser",
            lowerIsBetter: "Niedriger ist besser",
            neutral: "Neutral"
        }[direction];
    }
    if (language(locale) === "ar") {
        return {
            both: "إظهار الجانبين",
            higherIsBetter: "الأعلى أفضل",
            lowerIsBetter: "الأدنى أفضل",
            neutral: "محايد"
        }[direction];
    }
    return labels[direction];
}

export function alarmLabel(alarm: Alarm, locale?: string): string {
    if (language(locale) === "es") {
        return {
            outside3Sigma: "Fuera de 3 sigma",
            twoOfThree: "Dos de tres más allá de 2 sigma",
            shift: "Cambio",
            trend: "Tendencia"
        }[alarm.rule];
    }
    if (language(locale) === "fr") {
        return {
            outside3Sigma: "Hors de 3 sigma",
            twoOfThree: "Deux sur trois au-delà de 2 sigma",
            shift: "Décalage",
            trend: "Tendance"
        }[alarm.rule];
    }
    if (language(locale) === "de") {
        return {
            outside3Sigma: "Außerhalb von 3 Sigma",
            twoOfThree: "Zwei von drei jenseits von 2 Sigma",
            shift: "Verschiebung",
            trend: "Trend"
        }[alarm.rule];
    }
    if (language(locale) === "ar") {
        return {
            outside3Sigma: "خارج 3 سيغما",
            twoOfThree: "اثنتان من ثلاث بعد سيغما 2",
            shift: "تحول",
            trend: "اتجاه"
        }[alarm.rule];
    }
    return ruleLabel(alarm.rule);
}

export function specificationLabel(status: SpecificationStatus, locale?: string): string {
    switch (status) {
        case "within":
            return t("withinSpecification", locale);
        case "below":
            return t("belowSpecification", locale);
        case "above":
            return t("aboveSpecification", locale);
        case "notConfigured":
            return "";
    }
}

export function directionFromLocale(locale?: string): "ltr" | "rtl" {
    return /^(ar|fa|he|ur)([-_]|$)/i.test(locale ?? "") ? "rtl" : "ltr";
}
