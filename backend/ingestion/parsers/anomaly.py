"""
Anomaly detection for normalized activities.
Uses z-score analysis and rule-based checks.
"""
import math
from collections import defaultdict


def detect_anomalies(activities):
    """
    Takes a list of NormalizedActivity-like dicts.
    Returns list of (activity_index, issue_type, severity, message).
    """
    issues = []
    issues.extend(_rule_based_checks(activities))
    issues.extend(_zscore_checks(activities))
    issues.extend(_duplicate_checks(activities))
    return issues


def _rule_based_checks(activities):
    issues = []
    for i, a in enumerate(activities):
        val = a.get('activity_value', 0) or 0

        if val < 0:
            issues.append((i, 'NEGATIVE_VALUE', 'ERROR',
                f"Negative quantity {val} {a.get('activity_unit')} — likely data entry error"))

        if not a.get('period_start'):
            issues.append((i, 'MISSING_FIELD', 'WARNING',
                "No period start date — cannot attribute to reporting period"))

        if a.get('confidence_score', 1.0) < 0.65:
            issues.append((i, 'UNIT_UNKNOWN', 'WARNING',
                f"Low confidence ({a['confidence_score']:.2f}): {a.get('confidence_notes')}"))

        if a.get('activity_type', '').startswith('Flight') and a.get('activity_value', 0) > 18000:
            issues.append((i, 'ANOMALY_ZSCORE', 'WARNING',
                f"Flight distance {a['activity_value']} km exceeds maximum Earth circumference — check route"))

    return issues


def _zscore_checks(activities):
    """Flag records whose value is > 3 std deviations from the mean within their category."""
    issues = []
    by_category = defaultdict(list)
    for i, a in enumerate(activities):
        key = (a.get('scope'), a.get('category'), a.get('activity_unit'))
        by_category[key].append((i, a.get('activity_value', 0) or 0))

    for key, group in by_category.items():
        if len(group) < 4:
            continue
        values = [v for _, v in group]
        mean   = sum(values) / len(values)
        variance = sum((v - mean) ** 2 for v in values) / len(values)
        std    = math.sqrt(variance) if variance > 0 else 0
        if std == 0:
            continue
        for idx, val in group:
            z = abs(val - mean) / std
            if z > 3:
                issues.append((idx, 'ANOMALY_ZSCORE', 'WARNING',
                    f"Value {val:.1f} is {z:.1f} standard deviations from category mean "
                    f"({mean:.1f} ± {std:.1f}) — statistical outlier"))
    return issues


def _duplicate_checks(activities):
    """Flag records that share the same scope, category, period, and value."""
    issues = []
    seen = {}
    for i, a in enumerate(activities):
        key = (
            a.get('scope'),
            a.get('activity_type'),
            a.get('period_start'),
            round(a.get('activity_value', 0) or 0, 1),
        )
        if key in seen:
            issues.append((i, 'DUPLICATE', 'WARNING',
                f"Possible duplicate of row {seen[key]}: same type, period, and value"))
        else:
            seen[key] = i
    return issues
