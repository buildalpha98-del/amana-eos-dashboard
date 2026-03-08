// ─── Due Diligence Data Room Configuration ──────────────────────────────────
// Defines the 7 DD sections, required documents per section, and scoring weights.

import type { LucideIcon } from "lucide-react";
import {
  FileText,
  DollarSign,
  Users,
  ShieldCheck,
  ClipboardList,
  TrendingUp,
  Cpu,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

export type DocumentStatus = "present" | "missing" | "expired";

export interface RequiredDocument {
  key: string;
  label: string;
  description?: string;
  /** Where to look for this requirement */
  source: "document" | "financial" | "compliance" | "contract" | "policy" | "metrics" | "lead" | "computed";
  /** Filter by DocumentCategory enum */
  documentCategory?: string;
  /** Substring match on Document.title (case-insensitive) */
  documentTitleMatch?: string;
  /** Filter by CertificateType enum */
  certificateType?: string;
  /** Field on CentreMetrics to check for non-null/non-zero */
  metricsField?: string;
  /** Key for a custom computed check in the API */
  computedCheck?: string;
}

export interface DataRoomSectionConfig {
  key: string;
  label: string;
  icon: LucideIcon;
  iconColor: string;
  /** Weighting for overall score — all sections must sum to 100 */
  weight: number;
  requiredDocuments: RequiredDocument[];
}

// ─── Section Definitions ────────────────────────────────────────────────────

export const DATA_ROOM_SECTIONS: DataRoomSectionConfig[] = [
  {
    key: "corporate",
    label: "Corporate Documents",
    icon: FileText,
    iconColor: "#004E64",
    weight: 15,
    requiredDocuments: [
      { key: "service_approvals", label: "Service Approvals", source: "document", documentCategory: "compliance", documentTitleMatch: "service approval" },
      { key: "provider_approvals", label: "Provider Approvals", source: "document", documentCategory: "compliance", documentTitleMatch: "provider approval" },
      { key: "insurance_certificates", label: "Insurance Certificates", source: "document", documentCategory: "compliance", documentTitleMatch: "insurance" },
      { key: "abn_registration", label: "ABN / Company Registration", source: "document", documentCategory: "compliance", documentTitleMatch: "abn" },
    ],
  },
  {
    key: "financial",
    label: "Financial Records",
    icon: DollarSign,
    iconColor: "#10B981",
    weight: 25,
    requiredDocuments: [
      { key: "pnl_3yr", label: "P&L by Centre (Last 3 Years)", source: "computed", computedCheck: "has_3yr_financials" },
      { key: "revenue_trends", label: "Revenue Trends", source: "computed", computedCheck: "has_revenue_data" },
      { key: "budget_vs_actual", label: "Budget vs Actual", source: "computed", computedCheck: "has_budget_data" },
      { key: "xero_reports", label: "Xero Synced Reports", source: "computed", computedCheck: "has_xero_sync" },
    ],
  },
  {
    key: "employment_hr",
    label: "Employment & HR",
    icon: Users,
    iconColor: "#8B5CF6",
    weight: 15,
    requiredDocuments: [
      { key: "staff_contracts", label: "Staff Contracts", source: "computed", computedCheck: "has_active_contracts" },
      { key: "award_compliance", label: "Award Compliance Evidence", source: "computed", computedCheck: "has_award_levels" },
      { key: "qualification_records", label: "Qualification Records", source: "computed", computedCheck: "has_qualifications" },
      { key: "wwcc_register", label: "WWCC Register", source: "compliance", certificateType: "wwcc" },
      { key: "turnover_data", label: "Staff Turnover Data", source: "metrics", metricsField: "educatorsTurnover" },
    ],
  },
  {
    key: "compliance_regulatory",
    label: "Compliance & Regulatory",
    icon: ShieldCheck,
    iconColor: "#EF4444",
    weight: 20,
    requiredDocuments: [
      { key: "nqs_ratings", label: "NQS Ratings", source: "metrics", metricsField: "nqsRating" },
      { key: "qip_documents", label: "QIP Documents", source: "document", documentCategory: "compliance", documentTitleMatch: "qip" },
      { key: "policies_ack", label: "Policies with Acknowledgement Status", source: "computed", computedCheck: "has_published_policies" },
      { key: "incident_reports", label: "Incident Reports", source: "metrics", metricsField: "incidentCount" },
      { key: "compliance_certs", label: "Compliance Certificates (First Aid, CPR, etc.)", source: "computed", computedCheck: "has_compliance_certs" },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    icon: ClipboardList,
    iconColor: "#F59E0B",
    weight: 10,
    requiredDocuments: [
      { key: "programme_samples", label: "Programme Samples", source: "document", documentCategory: "program" },
      { key: "menu_plans", label: "Menu Plans", source: "computed", computedCheck: "has_menu_weeks" },
      { key: "attendance_records", label: "Attendance Records", source: "computed", computedCheck: "has_attendance_data" },
      { key: "parent_satisfaction", label: "Parent Satisfaction Data", source: "metrics", metricsField: "parentNps" },
    ],
  },
  {
    key: "growth_pipeline",
    label: "Growth & Pipeline",
    icon: TrendingUp,
    iconColor: "#3B82F6",
    weight: 10,
    requiredDocuments: [
      { key: "crm_pipeline", label: "CRM Pipeline Summary", source: "computed", computedCheck: "has_leads" },
      { key: "tender_submissions", label: "Tender Submissions", source: "computed", computedCheck: "has_tenders" },
      { key: "won_lost_analysis", label: "Won/Lost Analysis", source: "computed", computedCheck: "has_won_lost_data" },
    ],
  },
  {
    key: "technology",
    label: "Technology & Systems",
    icon: Cpu,
    iconColor: "#6366F1",
    weight: 5,
    requiredDocuments: [
      { key: "system_architecture", label: "System Architecture Overview", source: "document", documentCategory: "other", documentTitleMatch: "architecture" },
      { key: "owna_integration", label: "OWNA Integration Status", source: "computed", computedCheck: "has_owna_integration" },
      { key: "dashboard_capabilities", label: "Dashboard Capabilities", source: "computed", computedCheck: "always_present" },
    ],
  },
];

export const TOTAL_WEIGHT = DATA_ROOM_SECTIONS.reduce((sum, s) => sum + s.weight, 0);
