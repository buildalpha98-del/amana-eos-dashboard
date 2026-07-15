/**
 * Canonical Casual OSHC Educator contract template payload.
 *
 * Rebuilt verbatim from Rayan Safi's Employment Hero contract (dated
 * 2026-04-17) after Daniel lost his originals. Casual-loading-inclusive
 * rate, NES leave only, 1-hour termination notice, plus all the
 * standard Amana clauses (right to disconnect, IP, privacy,
 * deductions).
 *
 * Used by:
 *   - scripts/one-shots/seed-casual-educator-template.ts (CLI seed)
 *   - src/app/api/contract-templates/seed-defaults/route.ts (UI-triggerable)
 *
 * Merge tag conventions:
 *   {{staff.firstName}}, {{staff.fullName}}       — filled from User row
 *   {{contract.position}}, {{contract.payRate}}   — filled from EmploymentContract
 *   {{manager.fullName}}, {{manager.title}}       — issuing admin
 *   {{signature.admin}}, {{signature.staff}}      — canvas PNGs
 *   {{letterDate}}, {{today}}                     — system dates
 *   {{usualPlaceOfEmployment}}, etc.              — manual fields (below)
 */

export const CASUAL_EDUCATOR_TEMPLATE_NAME = "OSHC Educator — Casual";

export const CASUAL_EDUCATOR_TEMPLATE_DESCRIPTION =
  "Casual OSHC Educator — rebuilt from the Employment Hero source contract " +
  "(2026-04-17). Casual-loading-inclusive rate, NES leave only, 1hr notice, " +
  "standard Amana clauses (right to disconnect, IP, privacy, deductions).";

// manualFields is a legacy DB column; the current issue flow derives
// input fields from `custom.*` merge tags found in the content instead.
// Left empty here so a future author editing the template through the
// UI doesn't hit the identifier-regex validator.
export const CASUAL_EDUCATOR_MANUAL_FIELDS: Array<{
  key: string;
  label: string;
  type: "text" | "longtext" | "date" | "number";
  required: boolean;
  default?: string;
}> = [];

// ─── TipTap node helpers ────────────────────────────────────────────────────
const t = (text: string) => ({ type: "text", text });
const tag = (key: string) => ({ type: "mergeTag", attrs: { key } });
const strong = (text: string) => ({
  type: "text",
  text,
  marks: [{ type: "bold" }],
});
const p = (
  content: Array<Record<string, unknown>> | string,
): Record<string, unknown> => ({
  type: "paragraph",
  content: typeof content === "string" ? [t(content)] : content,
});
const empty = () => ({ type: "paragraph" });
const heading = (level: number, text: string) => ({
  type: "heading",
  attrs: { level },
  content: [t(text)],
});
const bulletList = (items: string[]) => ({
  type: "bulletList",
  content: items.map((text) => ({
    type: "listItem",
    content: [{ type: "paragraph", content: [t(text)] }],
  })),
});
const orderedList = (items: string[]) => ({
  type: "orderedList",
  content: items.map((text) => ({
    type: "listItem",
    content: [{ type: "paragraph", content: [t(text)] }],
  })),
});

export const CASUAL_EDUCATOR_CONTENT_JSON = {
  type: "doc",
  content: [
    // Header block
    p([tag("letterDate")]),
    empty(),
    p([tag("staff.fullName")]),
    empty(),
    empty(),
    p([t("Dear "), tag("staff.firstName"), t(",")]),
    empty(),
    p([t("Welcome to AMANA OSHC PTY LTD "), strong("(Employer)")]),
    empty(),
    p("This contract sets out the terms and conditions of your employment."),

    // 1. Employment
    heading(2, "1. Employment"),
    p([
      t(
        "1.1 You will be employed on a casual basis according to the needs of the Employer from time to time in the position of ",
      ),
      tag("contract.position"),
      t(
        ". The terms of this contract shall apply on each and every occasion that you are engaged by the Employer to perform services, regardless of your position or the duties you perform, unless agreed otherwise in writing.",
      ),
    ]),
    empty(),
    p("1.2 You agree that:"),
    bulletList([
      "a) your employment relationship is characterised by an absence of a firm advance commitment to continuing and indefinite work;",
      "b) the Employer can elect whether or not to offer you work according to its needs;",
      "c) you can elect to accept or reject any work offered;",
      "d) you will not have a regular pattern of work.",
    ]),
    empty(),
    p(
      "1.3 The Employer may change your title, role, accountability or reporting relationship at any time, where this change would be reasonable. This contract is not intended to give rise to an expectation or intention of an ongoing or continuous employment relationship.",
    ),

    // 2. Location
    heading(2, "2. Location"),
    p([
      t("2.1 Your usual place of employment will initially be "),
      tag("custom.usualPlaceOfEmployment"),
      t(
        ", as well as any other location required to fulfil the duties of your position. You may at any time be required to work at a different location nominated by the Employer on either a temporary or permanent basis.",
      ),
    ]),

    // 3. Hours
    heading(2, "3. Hours"),
    p(
      "3.1 As a casual employee you will not have reasonably predictable or regular hours of work, and you may be requested to work at any time of the week including late nights, weekends and public holidays to suit the Employer's operational requirements. The Employer will notify you when you are requested to work from time to time.",
    ),

    // 4. Hourly Rate
    heading(2, "4. Hourly Rate of Remuneration"),
    p([
      t(
        "4.1 You will be paid a gross hourly casual rate for time worked (less applicable taxation) of ",
      ),
      tag("contract.payRate"),
      t(", inclusive of any applicable casual loading."),
    ]),

    // 5. Superannuation
    heading(2, "5. Superannuation"),
    p(
      "5.1 In addition to the remuneration paid, the Employer will make the compulsory minimum superannuation contributions required into a complying fund in accordance with the Superannuation Guarantee (Administration) Act 1992 (Cth).",
    ),

    // 6. Right to Disconnect
    heading(2, "6. Employee Right to Disconnect"),
    p(
      "6.1 The Employer respects the rights of employees to disconnect as provided for in section 333M of the Fair Work Act 2009 (Cth) (when those provisions come into force), in particular the Employer recognises that:",
    ),
    bulletList([
      "a) An employee may refuse to monitor, read or respond to contact, or attempted contact, from the Employer outside of the employee's working hours unless the refusal is unreasonable; and",
      "b) An employee may refuse to monitor, read or respond to contact, or attempted contact, from a third party (such as a client or customer) if the contact or attempted contact relates to their work and is outside of the employee's working hours unless the refusal is unreasonable.",
    ]),
    empty(),
    p(
      "6.2 The Employer and the Employee agree that due to the nature of the Employee's role, it is reasonable for the Employee to be required to monitor, read and respond to contact and attempted to contact, from the Employer and from third parties (such as clients or customers) outside of the employee's working hours insofar as is necessary for the Employee to adequately perform their role.",
    ),
    empty(),
    p(
      "6.3 The Employee's remuneration and other benefits have been set to compensate the Employee for reasonable out-of-hours contact.",
    ),
    empty(),
    p([
      t(
        "6.4 In addition, the Employee may be entitled to (where relevant) the following additional benefits: ",
      ),
      tag("custom.additionalBenefits"),
    ]),
    empty(),
    p(
      "6.5 Examples of the types of reasonable out-of-hours contact that the Employee will be required to monitor, read or respond to include (but are not limited to): where we need to contact you in the case of an emergency, where there are unforeseen changes to the roster.",
    ),

    // 7. Expenses
    heading(2, "7. Expenses"),
    p(
      "7.1 You will be reimbursed for all reasonable out-of-pocket business expenses incurred in the proper performance of your duties that are authorised in advance by the Employer and supported by appropriate receipts, subject to the terms of any applicable workplace policy.",
    ),

    // 8. Duties and Responsibilities
    heading(2, "8. Duties and Responsibilities"),
    p("8.1 During your employment you must:"),
    bulletList([
      "Support the delivery of a safe, inclusive, high-quality Out of School Hours Care program for children aged 4–12 years, in accordance with applicable legislation, the National Quality Framework, and Service policies and procedures.",
      "Assist in the planning, implementation and evaluation of play-based educational programs aligned with My Time, Our Place.",
      "Support children's learning, wellbeing, identity, confidence, communication and social development.",
      "Contribute to observations, documentation and reflective practice under the direction of the OSHC Coordinator/Educational Leader.",
      "Promote inclusive practices that respect diversity and individual needs.",
      "Ensure children are adequately supervised at all times.",
      "Comply with child protection legislation and act as a mandated reporter where required.",
      "Follow all Service policies relating to child safety, behaviour guidance, supervision, excursions and collection of children.",
      "Administer first aid and medication in accordance with policy and training.",
      "Accurately record and report incidents, injuries, trauma or illness within required timeframes.",
      "Maintain appropriate educator-to-child ratios at all times.",
      "Follow all Service policies and procedures as amended from time to time.",
      "Maintain a valid Working with Children Check and mandatory certifications required for the role.",
      "Assist in maintaining a safe, clean, engaging and age-appropriate indoor and outdoor environment.",
      "Identify and report hazards, maintenance issues or safety concerns.",
      "Support environmentally sustainable practices within the Service.",
      "Participate in staff meetings, training and professional development as required.",
      "Promote a positive, inclusive and child-safe workplace culture.",
      "Raise concerns, complaints or grievances through appropriate management channels.",
      "Build respectful, supportive relationships with children and families.",
      "Communicate professionally and courteously with families and colleagues.",
      "Support family engagement and participation where appropriate.",
      "Promote children's rights, cultural safety and inclusion.",
    ]),

    // 9. Leave
    heading(2, "9. Leave"),
    p(
      "9.1 You are only entitled to leave to the extent provided for casual employees in accordance with the National Employment Standards in the Fair Work Act 2009 (Cth).",
    ),

    // 10. Workplace Policies
    heading(2, "10. Workplace Policies"),
    p(
      "10.1 The Employer may from time to time have written workplace policies in place which deal with a variety of matters concerning how the workplace operates, procedures to be followed and expectations in relation to particular aspects of the business. The purpose of these policies is to make clear what the Employer expects from you in relation to the aspect of the business dealt with by the policy.",
    ),
    empty(),
    p(
      "10.2 You are required to be familiar with the content of all such policies, and to comply with their terms at all times. Any failure to do so may result in disciplinary action. If you are uncertain of where these policies are located or what obligations they impose, you have an express obligation to raise this with your manager. Your manager will then provide you with, or direct you to, the required information.",
    ),
    empty(),
    p(
      "10.3 To the extent that the policies describe benefits and entitlements, these are discretionary in nature and are not intended to be contractual. The terms and conditions of your employment that are intended to be contractual are set out in this contract.",
    ),
    empty(),
    p(
      "10.4 The Employer may unilaterally introduce, vary, remove or replace policies at any time during the course of your employment.",
    ),

    // 11. Dress Code
    heading(2, "11. Dress Code and Protective Equipment"),
    p(
      "11.1 You are required to wear appropriate and adequate clothing and footwear (including where relevant protective clothing and/or equipment) suitable to the nature of the work you perform and the location where you perform that work, or as directed or required by the Employer's workplace policies.",
    ),
    empty(),
    p(
      "11.2 You must apply all due diligence to the care and maintenance of such clothing and equipment.",
    ),

    // 12. Company Property
    heading(2, "12. Company Property"),
    p([
      t(
        "12.1 The Employer may provide you with company property during the course of your employment such as ",
      ),
      tag("custom.companyPropertyItems"),
      t(
        ". The provision of any such company property is contingent on your role and will be provided at the absolute discretion of the Employer. You will not have a contractual entitlement to such company property and it may be withdrawn by the Employer at any time.",
      ),
    ]),
    empty(),
    p(
      "12.2 You must ensure that all company property in your possession or control is properly cared for and maintained.",
    ),
    empty(),
    p(
      "12.3 Any company property must be used in accordance with any applicable workplace policy. Personal use is not permitted other than as provided for by any workplace policy (or as otherwise expressly allowed for by the Employer).",
    ),

    // 13. Confidential Information
    heading(2, "13. Confidential Information"),
    p("13.1 During and after your employment, you must:"),
    bulletList([
      "Keep all Confidential Information secret and confidential;",
      "Take all reasonable and necessary precautions to maintain the secrecy and prevent the disclosure of any Confidential Information;",
      "Not disclose any Confidential Information to any third party; and",
      "Not use any part of or make copies of any Confidential Information, except: as reasonably required in the ordinary and proper course of your employment; to the extent required by law; or if the Employer's written consent is first obtained.",
    ]),
    empty(),
    p([
      strong('13.2 "Confidential Information" '),
      t(
        "means any information relating to the business or affairs of the Employer, its clients or its Related Bodies Corporate (as defined in the Corporations Act 2001 (Cth)), that is not in the public domain including, but not limited to, any document, record, computer file, lists of current or former clients, trade secrets, customer or client details and information, product or service information, teaching methods, sales and marketing information, lists of prospective clients or customers, information relating to any computer systems or software, financial information, discovery, invention, drawing, design, strategy, plan, data, report, process, proposal, budget, idea, concept or know how.",
      ),
    ]),
    empty(),
    p(
      "13.3 This clause will survive the termination of your employment, irrespective of the basis of the termination, and shall remain in full force and effect indefinitely.",
    ),

    // 14. Intellectual Property
    heading(2, "14. Intellectual Property"),
    p(
      "14.1 You acknowledge and agree that it is a condition of employment that the Employer shall be the owner of all Intellectual Property Rights in everything created, generated or contributed to by you in the course of your employment:",
    ),
    bulletList([
      "Whether alone or in conjunction with others.",
      "Whether during office hours or otherwise.",
      "Irrespective of where the creation, generation or contribution took place.",
      "Which: relates to the business or prospective business of the Employer; or was created, generated or contributed to using any equipment or facilities of the Employer.",
    ]),
    empty(),
    p(
      "14.2 You must do all things necessary to enable the Employer to confirm or perfect the Intellectual Property Rights assigned under this clause.",
    ),
    empty(),
    p(
      "14.3 You consent to any act or omission by or on behalf of or authorised by the Employer, or the Employer's assignees, licensees or successors in title and any person authorised by the Employer, or its assignees, licensees or successors in title which would otherwise infringe any part of your moral rights that subsist in any copyright works created by you.",
    ),
    empty(),
    p([
      strong('14.4 "Intellectual Property Rights" '),
      t(
        "means all intellectual property rights as defined by law including without limitation: (a) know how, trademarks, business names, the right to have confidential information kept confidential, copyright, inventions, improvements, designs, patents, discoveries, concept, circuits or other eligible layouts, numeric data, data or formulae, software, coding, models, drawings, plans, trade secrets, secret processes, reports, proposals, concepts or ideas; (b) any rights in respect of (a); and (c) any application or right to apply for registration of any of (a).",
      ),
    ]),
    empty(),
    p(
      "14.5 This clause will survive the termination of your employment, irrespective of the basis of the termination, and shall remain in full force and effect indefinitely.",
    ),

    // 15. Privacy
    heading(2, "15. Privacy"),
    p(
      "15.1 You consent to the Employer collecting and using personal information and sensitive personal information as defined in the Privacy Act 1988 (Cth) for any purpose relating to your employment with the Employer. The personal information will be held in a secure location.",
    ),
    empty(),
    p(
      "15.2 You also consent to the Employer disclosing personal information and sensitive personal information about you to other persons for reasons relating to your employment or for the Employer's business requirements. These persons include the Australian Tax Office, superannuation fund trustees and administrators, insurers, medical or occupational practitioners, financial and legal advisers, potential purchasers on sale of business and law enforcement bodies.",
    ),
    empty(),
    p(
      "15.3 You also consent to the Employer disclosing your personal information and image or likeness for marketing purposes including on the Employer's website.",
    ),
    empty(),
    p(
      "15.4 This clause will survive the termination of your employment, irrespective of the basis of the termination, and shall remain in full force and effect indefinitely.",
    ),

    // 16. Terminations
    heading(2, "16. Terminations"),
    p(
      "16.1 As a casual employee, your employment terminates at the end of each engagement and recommences on each new engagement. However, you or the Employer may terminate your employment or any engagement at any time for any reason by giving one hour's notice of termination, or the payment or forfeiture of one hour's wages in lieu of notice.",
    ),
    empty(),
    p(
      "16.2 On termination of your employment, you must immediately return to the Employer all company property that is in your possession, custody or control including but not limited to: all documents, Confidential Information, company property, software, computers, credit cards, keys, vehicles and property leased by the Employer.",
    ),

    // 17. Deductions
    heading(2, "17. Deductions"),
    p(
      "17.1 You agree to the extent permitted by law, that the Employer may make deductions from any amount payable to you:",
    ),
    orderedList([
      "Where the deduction amount relates to any overpayment of wages or other benefit or entitlement (including without limitation paid leave in advance of accrual).",
      "Where the deduction amount relates to the reasonable cost or repair of any equipment or property damaged, lost or not returned to the Employer; and/or",
      "Where you do not serve out your full notice period on termination but are required to do so by the Employer. The deduction amount will be equivalent to the value of the remuneration you would have earned during the balance of the notice period, and you acknowledge that this constitutes a reasonable estimate of the damage to the Employer arising from your failure to serve out the full notice period; and/or",
      "Of any other amount permissible by law.",
    ]),
    empty(),
    p(
      "17.2 You acknowledge that these deductions will be to your benefit as they will discharge any debts owed by you to the Employer.",
    ),
    empty(),
    p(
      "17.3 You agree to execute any separate written document necessary to give effect to any such deduction.",
    ),
    empty(),
    p(
      "17.4 This clause will survive the termination of your employment, irrespective of the basis of the termination, and shall remain in full force and effect indefinitely.",
    ),

    // 18. General
    heading(2, "18. General"),
    p(
      "18.1 This contract will continue to apply to your employment notwithstanding any change to your position, duties, hours of work, remuneration or location, unless otherwise agreed in writing.",
    ),
    empty(),
    p(
      "18.2 This contract constitutes the entire agreement between you and the Employer with respect to its subject matter, and supersedes any prior written or other agreement between you and the Employer to the extent permitted by law.",
    ),
    empty(),
    p(
      "18.3 After execution, the terms of this contract may not be changed or modified in any way other than as contemplated by this contract, unless it is in writing signed by both you and the Employer.",
    ),
    empty(),
    p(
      "18.4 This contract will terminate on the termination of your employment, save for those clauses which are expressly stated throughout this contract to survive termination.",
    ),
    empty(),
    p(
      "18.5 This contract is governed by the laws of the jurisdiction of your initial usual place of employment as described in clause 2.1.",
    ),

    // Sign-off
    empty(),
    p(
      "If you accept the terms contained in this contract, please sign the declaration below.",
    ),
    empty(),
    p("Yours sincerely,"),
    empty(),
    p([tag("signature.admin")]),
    p([tag("manager.fullName")]),
    p([tag("manager.title")]),
    p("Amana OSHC"),
    empty(),
    empty(),
    p([strong("Signed by the Employee:")]),
    empty(),
    p([tag("signature.staff")]),
    p([tag("staff.fullName")]),
    p([t("Date: "), tag("today")]),
  ],
} as const;
