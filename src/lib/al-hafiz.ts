/**
 * Al Hafiz × MFIS Iqra (Daniel, 2 Nov 2026): Sh Yasir's program for MFIS
 * Iqra students, now run together with Amana's before-school care at MFIS
 * Greenacre. Families arrive from his QR codes and flyers via the website's
 * hidden page (amanaoshc.com.au/centres/mfis-greenacre/al-hafiz), which links
 * to the normal enrolment form with ?centre=mfis-greenacre&program=al-hafiz.
 *
 * The form asks "Is <child> in the Al Hafiz program?" only for MFIS
 * Greenacre, pre-ticked when the family came through that link, so staff can
 * see these families. It's a tag — the enrolment is otherwise the same.
 */
export const AL_HAFIZ_SCHOOL = "Malek Fahd Greenacre";
export const AL_HAFIZ_PROGRAM = "al-hafiz";
export const AL_HAFIZ_LABEL = "Al Hafiz";

/** The question only applies to MFIS Greenacre children. */
export function offersAlHafiz(schoolName: unknown): boolean {
  return schoolName === AL_HAFIZ_SCHOOL;
}

/** True when a submitted child is tagged Al Hafiz (and still at Greenacre). */
export function childIsAlHafiz(child: object): boolean {
  const c = child as { alHafiz?: unknown; schoolName?: unknown };
  return c.alHafiz === true && offersAlHafiz(c.schoolName);
}
