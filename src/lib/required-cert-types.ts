/**
 * Central source of truth for which CertificateType values count as
 * "required" across the compliance system. Previously these lists
 * lived in three separate route files, drifting independently —
 * 2026-06-01 we centralised + added the two cert types introduced
 * earlier in the day (mandatory_reporter_training,
 * child_safe_code_of_conduct).
 *
 * Three sets, because "required" means different things in different
 * surfaces:
 *
 *   - COMPLIANCE_MATRIX_TYPES: the comprehensive list shown on the
 *     org-wide compliance matrix. Covers everything we audit.
 *
 *   - COMPLIANCE_EXPORT_TYPES: the columns included in the CSV
 *     compliance report (used by directors + sometimes regulators).
 *     Slightly leaner — only the legally-mandated training and
 *     screening checks.
 *
 *   - STAFF_HEADLINE_TYPES: the few certs surfaced on the staff
 *     My Hub dashboard widget. Intentionally short to keep that
 *     widget readable; covers the legal minimum each educator must
 *     hold to work.
 *
 * Source documents:
 *   - NQS Element 7.1.2 (right people working with children)
 *   - National Law s162 (working with children check)
 *   - Children's Services Award 2010 (qualifications)
 *   - 2024 NSW Reportable Conduct Scheme + analogous state laws
 *     (mandatory reporter training)
 *   - Voluntary Child Safe National Principles (child safe code)
 */

import type { CertificateType } from "@prisma/client";

/**
 * The full comprehensive list — every cert we treat as "required" in
 * the compliance matrix. Adding a new cert type usually means adding
 * it here. The matrix uses this to compute the per-staff progress
 * percentage.
 */
export const COMPLIANCE_MATRIX_TYPES: readonly CertificateType[] = [
  "wwcc",
  "first_aid",
  "anaphylaxis",
  "asthma",
  "cpr",
  "police_check",
  "annual_review",
  "child_protection",
  "geccko",
  "food_safety",
  "food_handler",
  "mandatory_reporter_training",
  "child_safe_code_of_conduct",
] as const;

/**
 * The CSV-export list. Slightly leaner than the full matrix — pure
 * compliance documents that regulators or third-party auditors are
 * likely to ask for.
 */
export const COMPLIANCE_EXPORT_TYPES: readonly CertificateType[] = [
  "wwcc",
  "first_aid",
  "anaphylaxis",
  "asthma",
  "cpr",
  "police_check",
  "annual_review",
  "mandatory_reporter_training",
  "child_safe_code_of_conduct",
] as const;

/**
 * The headline-card list — what shows on the staff My Hub widget.
 * Intentionally short so the dashboard stays readable. The
 * percentage shown there is "of these N headline certs, how many
 * are valid."
 */
export const STAFF_HEADLINE_TYPES: readonly CertificateType[] = [
  "wwcc",
  "first_aid",
  "anaphylaxis",
  "asthma",
  "cpr",
  "police_check",
  "mandatory_reporter_training",
  "child_safe_code_of_conduct",
] as const;
