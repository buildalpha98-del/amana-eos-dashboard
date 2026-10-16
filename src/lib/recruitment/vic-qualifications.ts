/**
 * What counts as "diploma level" for educators in Victorian OSHC — a
 * plain-English summary of ACECQA's approved qualifications list for
 * educators working with children over preschool age, Victoria
 * (list updated 11 May 2026). Reg 356(2): at least half the educators needed
 * for ratio must hold, or be enrolled in and studying, one of these.
 *
 * Shown on the apply form for Victorian ads so applicants who already
 * qualify — teachers, youth workers, sport-science grads — know they do.
 * Keep in step with the website's careers page and blog post.
 */
export const VIC_DIPLOMA_LEVEL_GROUPS: { title: string; items: string[] }[] = [
  {
    title: "Children's services",
    items: [
      "Diploma of School Age Education and Care",
      "Diploma of Early Childhood Education and Care",
      "Diploma of Out of School Hours Care / Children's Services (OSHC)",
    ],
  },
  {
    title: "Teaching and education",
    items: [
      "A teaching or education qualification (primary or secondary) at diploma level or above — e.g. a Bachelor of Education",
      "Current Teacher Registration",
      "Certificate in Teaching/Education requiring at least 2 years' study",
      "Diploma in Education Support (at least 2 years' study)",
    ],
  },
  {
    title: "Youth and community",
    items: [
      "Diploma of Community Services or Community Welfare Work",
      "Diploma or Bachelor of Youth Work",
      "Bachelor of Arts (Youth Studies, Youth Affairs or Recreation); Bachelor of Social Science (Youth Work)",
      "Bachelor of Social Work (with 12 months' experience with school-age children)",
    ],
  },
  {
    title: "Sport and recreation",
    items: [
      "Bachelor of Physical Education, or Applied Science (Physical Education)",
      "Bachelor of Sport Science (Exercise Science)",
      "Associate Diploma in Arts (Fitness, Recreation or Leadership)",
    ],
  },
];
