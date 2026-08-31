/**
 * /surveys — staff-facing "My Surveys" list.
 *
 * Every logged-in user sees the surveys their account is in the
 * audience for. Server does the audience filtering — the client
 * just renders the response from GET /api/surveys?mine=1 and
 * launches the TakeSurvey form on click.
 *
 * 2026-07-08: shipped after the admin builder — Daniel tested a
 * "by service" survey and staff couldn't reach it because there
 * was no UI here. This closes the loop.
 */

import { MySurveysPage } from "@/components/surveys/MySurveysPage";

export default function StaffSurveysRoute() {
  return <MySurveysPage />;
}
