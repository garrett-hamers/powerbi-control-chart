# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Quality, safety, manufacturing, laboratory, service-operations, and data-quality analysts who monitor ordered observations inside Power BI.

## Product Purpose

Atlyn Control Chart is an offline Power BI custom visual for inspecting process stability, identifying deterministic statistical signals, and explaining the evidence behind each signal. Success means that an analyst can trace a displayed value, baseline, limit, and alarm back to the supplied data and settings.

## Positioning

The visual treats statistical calculations, control limits, specification limits, and rule alarms as separate auditable concepts rather than implying that a signal proves a cause.

## Operating Context

The visual runs inside Power BI reports and must work with categorical data, cross-filtering, highlighting, tooltips, context menus, keyboard navigation, touch-sized viewports, RTL layouts, localization, high-contrast palettes, and reduced-motion preferences.

## Capabilities and Constraints

- Supported modes are Individuals, Run, MR, Xbar, R, S, P, NP, U, and C.
- Time and Value are required roles; Denominator is required for P, NP, and U,
  and is subgroup size for Xbar/R/S when available.
- SubgroupSD, Series, BaselineGroup, and Tooltips are optional role inputs.
- Run mode is a conventional median-centered run chart without statistical control limits.
- P and U modes use normalized rate units for points, limits, specifications, alarms, highlights, and tooltips.
- Raw numerator/count values remain separate from normalized plot values in every
  rendered and accessible surface.
- MR is the within-series moving range; Xbar uses subgroup means with optional
  subgroup standard deviations; R and S use standard subgroup constants.
- Control limits and specification limits remain distinct.
- The implementation is certification-first: no privileges, network calls, external assets, unsafe DOM APIs, or claims of Microsoft certification or real-host validation.
- The visual GUID is an existing product identifier and must remain stable once published.

## Brand Commitments

The product name is Atlyn Control Chart. The product language should be precise, neutral, and evidence-oriented.

## Evidence on Hand

The repository contains the product README and the requirements research document supplied with the implementation task. No customer data, certification approval, or host-validation evidence is available and must not be fabricated.

## Product Principles

- Make every calculation reproducible.
- Keep common-cause variation, control signals, and specification conformance distinct.
- Prefer deterministic rules over opaque heuristics.
- Make alarms understandable without relying on color alone.
- Preserve Power BI host conventions and offline certification constraints.

## Accessibility & Inclusion

Keyboard operation, semantic alarm summaries, screen-reader labels, host high-contrast colors, RTL layout, localization, reduced motion, mobile touch interaction, and non-color alarm indicators are required.
