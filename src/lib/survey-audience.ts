/**
 * Survey audience matcher.
 *
 * A Survey's audience is stored as one enum value + a bag of filter
 * arrays. This helper answers a single question: does user X belong
 * to survey Y's audience? Used by GET /api/surveys (to filter "my
 * surveys" for the current user) and POST /api/surveys/[id]/responses
 * (to reject submissions from users outside the target audience).
 *
 * Deliberately evaluates at read/write time rather than materialising
 * an SurveyAssignment table — adding new staff mid-survey should pick
 * them up automatically without a backfill job.
 */

import type { EmploymentType, Role, SurveyAudience } from "@prisma/client";

export interface AudienceFilters {
  audience: SurveyAudience;
  audienceRoles: Role[];
  audienceServiceIds: string[];
  audienceEmploymentTypes: EmploymentType[];
}

export interface AudienceUser {
  id: string;
  role: Role;
  serviceId: string | null;
  employmentType: EmploymentType | null;
  active: boolean;
}

/**
 * True if `user` matches the survey's audience. Inactive users are
 * always excluded — offboarded staff shouldn't see new surveys.
 */
export function isInAudience(
  survey: AudienceFilters,
  user: AudienceUser,
): boolean {
  if (!user.active) return false;
  switch (survey.audience) {
    case "all_staff":
      return true;
    case "by_role":
      return survey.audienceRoles.includes(user.role);
    case "by_service":
      return !!user.serviceId && survey.audienceServiceIds.includes(user.serviceId);
    case "by_employment_type":
      return (
        !!user.employmentType &&
        survey.audienceEmploymentTypes.includes(user.employmentType)
      );
    default:
      return false;
  }
}
