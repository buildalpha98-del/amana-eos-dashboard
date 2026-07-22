/**
 * Canonical OSHC Coordinator — Part-Time Permanent contract template.
 *
 * Rebuilt clause-for-clause from Tamjid Rohman's Employment Hero
 * source contract (2026-02-03, "Director of Service OSHC — Part Time
 * Permanent"). Governed by the Children's Services Award 2010
 * (MA000120). Standard Amana permanent clauses — 6-month probation,
 * NES notice table, NES leave, IP / privacy / deductions / general.
 *
 * Same merge-tag conventions as the casual preset:
 *   {{staff.firstName}}, {{staff.fullName}}         — filled from User row
 *   {{staff.address}}, {{staff.cityStatePostcode}}  — from User row (non-blocking)
 *   {{contract.startDate}}, {{contract.position}}   — filled from EmploymentContract
 *   {{contract.payRate}}, {{contract.hoursPerWeek}}
 *   {{manager.fullName}}, {{manager.title}}         — issuing admin
 *   {{signature.admin}}, {{signature.staff}}        — canvas PNGs
 *   {{letterDate}}, {{today}}                       — system dates
 *   {{custom.*}}                                    — auto-derived inputs
 */

export const COORDINATOR_PERMANENT_TEMPLATE_NAME =
  "OSHC Coordinator — Part-Time Permanent";

export const COORDINATOR_PERMANENT_TEMPLATE_DESCRIPTION =
  "Part-time permanent OSHC Coordinator (Director of Service) — rebuilt " +
  "from the Employment Hero source contract (2026-02-03). Governed by " +
  "the Children's Services Award 2010 (MA000120). 6-month probation, " +
  "NES notice table, NES leave, fortnightly pay, standard Amana clauses.";

// manualFields is a legacy DB column; the current issue flow derives
// input fields from `custom.*` merge tags found in the content instead.
export const COORDINATOR_PERMANENT_MANUAL_FIELDS: Array<{
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

// Helper: sub-heading inside the duties list — Tamjid's contract uses
// bold section labels between bullet groups.
const dutyGroupHeading = (text: string) => ({
  type: "paragraph",
  content: [strong(text)],
});

export const COORDINATOR_PERMANENT_CONTENT_JSON = {
  type: "doc",
  content: [
    // Header block
    p([tag("letterDate")]),
    empty(),
    p([tag("staff.fullName")]),
    p([tag("staff.address")]),
    p([tag("staff.cityStatePostcode")]),
    empty(),
    p([t("Dear "), tag("staff.firstName"), t(",")]),
    empty(),
    p([t("Welcome to AMANA OSHC PTY LTD "), strong("(Employer)")]),
    empty(),
    p("This contract sets out the terms and conditions of your employment."),

    // 1. Employment
    heading(2, "1. Employment"),
    p([
      t("1.1 The commencement date of your employment is "),
      tag("contract.startDate"),
      t("."),
    ]),
    empty(),
    p([
      t("1.2 You are employed on a part time basis in the position of "),
      tag("contract.position"),
      t(
        ". You will report to the State Manager, or any other person directed by the Employer from time to time. The Employer may change your title, role, accountability or reporting relationship at any time, where this change would be reasonable.",
      ),
    ]),
    empty(),
    p([
      strong("1.3 Prior agreements: "),
      t(
        "This contract supersedes and replaces any prior employment agreement between you and AMANA OSHC PTY LTD, regardless of the employment type of that prior agreement (whether casual, part-time, permanent, or fixed-term). From the commencement of this contract, any earlier agreement ceases to have effect and this contract constitutes the terms of your employment on a part-time permanent basis going forward.",
      ),
    ]),

    // 2. Location
    heading(2, "2. Location"),
    p(
      "2.1 Your usual place of employment will initially be NSW, as well as any other location required to fulfil the duties of your position. You may at any time be required to work at a different location nominated by the Employer on either a temporary or permanent basis.",
    ),

    // 3. Probation
    heading(2, "3. Probation"),
    p([
      t("3.1 Your employment will be subject to an initial "),
      tag("custom.probationMonths"),
      t(
        " month probationary period. During probation, the Employer will assess the suitability of your continuing employment, and either party may terminate your employment by providing one week's written notice to the other party (or pay in lieu of notice).",
      ),
    ]),

    // 4. Hours
    heading(2, "4. Hours"),
    p([
      t("4.1 Your ordinary hours of work will be "),
      tag("contract.hoursPerWeek"),
      t(" hours per week with "),
      tag("custom.includedHours"),
      t(" included."),
    ]),
    empty(),
    p(
      "4.2 The Employer may also require you to work reasonable additional hours beyond your ordinary hours, including on weekends. You agree, having regard to the Employer's operational requirements, the nature of your position and the wage paid to you under this contract, that all additional hours are reasonable.",
    ),
    empty(),
    p(
      "4.3 You may be requested to perform work on a public holiday, where the request is reasonable. You may only refuse a request to work on a public holiday where such a refusal is reasonable.",
    ),

    // 5. Remuneration
    heading(2, "5. Remuneration"),
    p([
      t("5.1 You will be paid a gross hourly rate of "),
      tag("contract.payRate"),
      t(" (less applicable tax)."),
    ]),
    empty(),
    p(
      "5.2 You may also receive other payments, allowances, penalty rates, or higher hourly rates of pay for work performed at particular times, in accordance with the applicable Award and/or Company policies. If you do not attend a rostered shift and you do not have sufficient paid leave available (or do not provide evidence where required), the missed hours may be treated as an unpaid absence and will not be paid.",
    ),
    empty(),
    p(
      "5.3 All payments made to you by the Employer throughout your employment (regardless of whether they are expressly referred to or guaranteed by this contract) compensate for and set-off to the fullest extent possible all combined benefits or entitlements you have under any applicable industrial instrument or law. This includes, without limitation, payment for all hours worked, any minimum wage, payment for minimum periods of engagement, overtime, penalty rates for weekend work or public holiday work, shift and overtime allowances, meal allowances, annual leave loading and any other allowances and loadings to which you may otherwise be entitled. Where the combined monetary value of all such benefits or entitlements exceed the combined monetary value of all payments actually made to you, the Employer's further payment obligations shall be limited to the difference between those two combined amounts.",
    ),
    empty(),
    p([
      t("5.4 Your wages will be paid "),
      tag("custom.payFrequency"),
      t(
        " by electronic funds transfer into your nominated bank or building society account less applicable tax. The Employer may unilaterally amend the frequency of payment at any time by providing you with notice in writing.",
      ),
    ]),

    // 6. Superannuation
    heading(2, "6. Superannuation"),
    p(
      "6.1 In addition to the remuneration paid, the Employer will make the compulsory minimum superannuation contributions required into a complying fund in accordance with the Superannuation Guarantee (Administration) Act 1992 (Cth).",
    ),

    // 7. Right to Disconnect
    heading(2, "7. Employee Right to Disconnect"),
    p(
      "7.1 The Employer respects the rights of employees to disconnect as provided for in section 333M of the Fair Work Act 2009 (Cth) (when those provisions come into force), in particular the Employer recognises that:",
    ),
    bulletList([
      "a) An employee may refuse to monitor, read or respond to contact, or attempted contact, from the Employer outside of the employee's working hours unless the refusal is unreasonable; and",
      "b) An employee may refuse to monitor, read or respond to contact, or attempted contact, from a third party (such as a client or customer) if the contact or attempted contact relates to their work and is outside of the employee's working hours unless the refusal is unreasonable.",
    ]),
    empty(),
    p(
      "7.2 The Employer and the Employee agree that due to the nature of the Employee's role, it is reasonable for the Employee to be required to monitor, read and respond to contact and attempted to contact, from the Employer and from third parties (such as clients or customers) outside of the employee's working hours insofar as is necessary for the Employee to adequately perform their role.",
    ),
    empty(),
    p(
      "7.3 The Employee's remuneration and other benefits have been set to compensate the Employee for reasonable out-of-hours contact.",
    ),
    empty(),
    p([
      t(
        "7.4 In addition, the Employee may be entitled to (where relevant) the following additional benefits: ",
      ),
      tag("custom.additionalBenefits"),
    ]),
    empty(),
    p(
      "7.5 Examples of the types of reasonable out-of-hours contact that the Employee will be required to monitor, read or respond to include (but are not limited to): where we need to contact you in the case of an emergency, where there are unforeseen changes to the roster.",
    ),

    // 8. Expenses
    heading(2, "8. Expenses"),
    p(
      "8.1 You will be reimbursed for all reasonable out-of-pocket business expenses incurred in the proper performance of your duties that are authorised in advance by the Employer and supported by appropriate receipts, subject to the terms of any applicable workplace policy.",
    ),

    // 9. Duties and responsibilities
    heading(2, "9. Duties and responsibilities"),
    p("9.1 During your employment you must:"),
    bulletList([
      "Devote the whole of your time, attention and skill during normal working hours and at other times as reasonably necessary to perform your duties;",
      "Perform the duties reasonably required or directed by the Employer from time to time, irrespective of which position you hold;",
      "Follow and comply with all reasonable and lawful directions given to you by the Employer;",
      "Be faithful and diligent, and actively pursue the Employer's best interests at all times;",
      "Not compete, directly or indirectly, with the Employer;",
      "Not, in connection with your employment with the Employer, accept any financial or other benefit except from the Employer, unless such benefit is disclosed to the Employer and it expressly permits you to accept it;",
      "Not conduct yourself in a manner, whether during or after work hours, that in the opinion of the Employer causes damage or potential damage to the Employer's property or reputation;",
      "Not use internet, email or voicemail at the Employer's workplace for excessive personal use, to view or distribute offensive or illegal material, or in any manner not consistent with the Employer's workplace policies;",
      "Not unlawfully discriminate against, sexually harass or bully another person in any manner related to your employment or the Employer's business.",
    ]),

    empty(),
    dutyGroupHeading("Educational Program & Practice"),
    bulletList([
      "Ensure quality play and leisure-based educational programs for children aged 4–12 years",
      "Implement programs based on the My Time, Our Place Framework",
      "Support the Educational Leader in meeting MTOP learning framework goals",
      "Implement inclusive practices honouring diversity",
    ]),

    empty(),
    dutyGroupHeading("Children's Health & Safety"),
    bulletList([
      "Promote child wellbeing and adhere to National Principles of Child Safe Organisations",
      "Maintain extensive knowledge of Child Protection legislation",
      "Ensure compliance as a mandated reporter",
      "Lead hygiene and safe food handling practices",
    ]),

    empty(),
    dutyGroupHeading("Staffing & Leadership"),
    bulletList([
      "Facilitate induction of new educators and staff",
      "Ensure compliance with the National Quality Framework",
      "Conduct regular staff appraisals and professional development",
      "Maintain educator qualifications and ratios as per NQF requirements",
    ]),

    empty(),
    dutyGroupHeading("Governance & Administration"),
    bulletList([
      "Act as Nominated Supervisor under the Education and Care Services National Law",
      "Manage the service budget effectively",
      "Maintain compliance with all relevant legislation and regulations",
      "Provide periodic reports to the Area Manager / Approved Provider",
      "Not engage in any employment or provide any services to any person or entity other than the Employer during your employment without the Employer's prior written consent",
    ]),

    // 10. Leave
    heading(2, "10. Leave"),
    p(
      "10.1 You are entitled to leave in accordance with the National Employment Standards in the Fair Work Act 2009 (Cth).",
    ),
    empty(),
    p(
      "10.2 Where authorised by the Fair Work Act 2009 (Cth) or any applicable modern award or other industrial instrument, you may be required to take annual leave at times required by the employer, such as during an annual closedown of operations.",
    ),

    // 11. Workplace Policies
    heading(2, "11. Workplace Policies"),
    p(
      "11.1 The Employer may from time to time have written workplace policies in place which deal with a variety of matters concerning how the workplace operates, procedures to be followed and expectations in relation to particular aspects of the business. The purpose of these policies is to make clear what the Employer expects from you in relation to the aspect of the business dealt with by the policy.",
    ),
    empty(),
    p(
      "11.2 You are required to be familiar with the content of all such policies, and to comply with their terms at all times. Any failure to do so may result in disciplinary action up to and including termination of employment. If you are uncertain of where these policies are located or what obligations they impose, you have an express obligation to raise this with your manager. Your manager will then provide you with, or direct you to, the required information.",
    ),
    empty(),
    p(
      "11.3 To the extent that the policies describe benefits and entitlements for the Employee or impose any obligations on the Employer, these are discretionary in nature and are not intended to be contractual. The terms and conditions of your employment that are intended to be contractual are set out in this contract.",
    ),
    empty(),
    p(
      "11.4 The Employer may unilaterally introduce, vary, remove or replace policies at any time during the course of your employment.",
    ),

    // 12. Dress Code
    heading(2, "12. Dress Code and Protective Equipment"),
    p(
      "12.1 You are required to wear appropriate and adequate clothing and footwear (including where relevant protective clothing and/or equipment) suitable to the nature of the work you perform and the location where you perform that work, or as directed or required by the Employer's workplace policies.",
    ),
    empty(),
    p(
      "12.2 You must apply all due diligence to the care and maintenance of such clothing and equipment.",
    ),

    // 13. Company Property
    heading(2, "13. Company Property"),
    p([
      t(
        "13.1 The Employer may provide you with company property during the course of your employment such as ",
      ),
      tag("custom.companyPropertyItems"),
      t(
        ". The provision of any such company property is contingent on your role and will be provided at the absolute discretion of the Employer. You will not have a contractual entitlement to such company property and it may be withdrawn by the Employer at any time.",
      ),
    ]),
    empty(),
    p(
      "13.2 You must ensure that all company property in your possession or control is properly cared for and maintained.",
    ),
    empty(),
    p(
      "13.3 Any company property must be used in accordance with any applicable workplace policy. Personal use is not permitted other than as provided for by any workplace policy (or as otherwise expressly allowed for by the Employer).",
    ),

    // 14. Confidential Information
    heading(2, "14. Confidential Information"),
    p("14.1 During and after your employment, you must:"),
    bulletList([
      "Keep all Confidential Information secret and confidential;",
      "Take all reasonable and necessary precautions to maintain the secrecy and prevent the disclosure of any Confidential Information;",
      "Not disclose any Confidential Information to any third party; and",
      "Not use any part of or make copies of any Confidential Information, except: as reasonably required in the ordinary and proper course of your employment; to the extent required by law; or if the Employer's written consent is first obtained.",
    ]),
    empty(),
    p([
      strong('14.2 "Confidential Information" '),
      t(
        "means any information relating to the business or affairs of the Employer, its clients or its Related Bodies Corporate (as defined in the Corporations Act 2001 (Cth)), that is not in the public domain including, but not limited to, any document, record, computer file, lists of current or former clients, trade secrets, customer or client details and information, product or service information, teaching methods, sales and marketing information, lists of prospective clients or customers, information relating to any computer systems or software, financial information, discovery, invention, drawing, design, strategy, plan, data, report, process, proposal, budget, idea, concept or know how.",
      ),
    ]),
    empty(),
    p(
      "14.3 This clause will survive the termination of your employment, irrespective of the basis of the termination, and shall remain in full force and effect indefinitely.",
    ),

    // 15. Intellectual Property
    heading(2, "15. Intellectual Property"),
    p(
      "15.1 You acknowledge and agree that it is a condition of employment that the Employer shall be the owner of all Intellectual Property Rights in everything created, generated or contributed to by you in the course of your employment:",
    ),
    bulletList([
      "Whether alone or in conjunction with others;",
      "Whether during office hours or otherwise;",
      "Irrespective of where the creation, generation or contribution took place;",
      "Which: relates to the business or prospective business of the Employer; or was created, generated or contributed to using any equipment or facilities of the Employer.",
    ]),
    empty(),
    p(
      "15.2 You must do all things necessary to enable the Employer to confirm or perfect the Intellectual Property Rights assigned under this clause.",
    ),
    empty(),
    p(
      "15.3 You consent to any act or omission by or on behalf of or authorised by the Employer, or the Employer's assignees, licensees or successors in title and any person authorised by the Employer, or its assignees, licensees or successors in title which would otherwise infringe any part of your moral rights that subsist in any copyright works created by you.",
    ),
    empty(),
    p([
      strong('15.4 "Intellectual Property Rights" '),
      t(
        "means all intellectual property rights as defined by law including without limitation: (a) know how, trademarks, business names, the right to have confidential information kept confidential, copyright, inventions, improvements, designs, patents, discoveries, concept, circuits or other eligible layouts, numeric data, data or formulae, software, coding, models, drawings, plans, trade secrets, secret processes, reports, proposals, concepts or ideas; (b) any rights in respect of (a); and (c) any application or right to apply for registration of any of (a).",
      ),
    ]),
    empty(),
    p(
      "15.5 This clause will survive the termination of your employment, irrespective of the basis of the termination, and shall remain in full force and effect indefinitely.",
    ),

    // 16. Conflicts of Interest
    heading(2, "16. Conflicts of Interest"),
    p(
      "16.1 You are required to immediately disclose any potential, perceived or actual conflict of interest (whether direct or indirect) that may give rise to a conflict with the performance of your employment obligations to the Employer, or the Employer's business or reputational interests. The Employer may require you to take action to eliminate or reduce any such conflict. In the event that in the opinion of the Employer you fail or refuse to declare any such conflict, or to resolve it in a manner satisfactory to the Employer in accordance with its directions, then notwithstanding any other provision of this contract, the Employer may terminate your employment on an immediate basis.",
    ),

    // 17. Privacy
    heading(2, "17. Privacy"),
    p(
      "17.1 You consent to the Employer collecting and using personal information and sensitive personal information as defined in the Privacy Act 1988 (Cth) for any purpose relating to your employment with the Employer. The personal information will be held in a secure location.",
    ),
    empty(),
    p(
      "17.2 You also consent to the Employer disclosing personal information and sensitive personal information about you to other persons for reasons relating to your employment or for the Employer's business requirements. These persons include the Australian Tax Office, superannuation fund trustees and administrators, insurers, medical or occupational practitioners, financial and legal advisers, potential purchasers on sale of business and law enforcement bodies.",
    ),
    empty(),
    p(
      "17.3 You also consent to the Employer disclosing your personal information and image or likeness for marketing purposes including on the Employer's website.",
    ),
    empty(),
    p(
      "17.4 This clause will survive the termination of your employment, irrespective of the basis of the termination, and shall remain in full force and effect indefinitely.",
    ),

    // 18. Stand-down and Suspension
    heading(2, "18. Stand-down and Suspension"),
    p(
      "18.1 The Employer may stand you down from your employment either with or without pay during a period in which you cannot usefully be employed, in accordance with section 524 of the Fair Work Act 2009 (Cth).",
    ),
    empty(),
    p(
      "18.2 If you are under investigation for alleged conduct that would be in breach of your obligations to the Employer, the Employer may suspend you either with or without pay while the investigation is being conducted.",
    ),
    empty(),
    p(
      "18.3 The decision as to pay referred to in this clause is at the absolute discretion of the Employer.",
    ),

    // 19. Termination of Employment
    heading(2, "19. Termination of Employment"),
    p(
      "19.1 Following any probationary period applying to your employment, you or the Employer may terminate your employment at any time for any reason by providing the following amount of written notice (or, in the case of the Employer, the minimum period set out in applicable legislation if this is greater):",
    ),
    empty(),
    p([strong("Period of continuous service: Notice period")]),
    p("Not more than one year: 1 week"),
    p("More than 1 year but not more than 3 years: 2 weeks"),
    p("More than 3 years but not more than 5 years: 3 weeks"),
    p("More than 5 years: 4 weeks"),
    empty(),
    p(
      "The period of notice will increase by 1 week if the employee is over 45 years old and has completed at least two years of continuous service.",
    ),
    empty(),
    p(
      "19.2 The Employer may terminate your employment immediately if in the opinion of the Employer you:",
    ),
    bulletList([
      "Disobey or refuse to carry out a lawful direction of the Employer;",
      "Are guilty of serious misconduct including without limitation committing any act of dishonesty, fraud, theft, unlawful harassment (including sexual harassment) or discrimination, or wilful breach of duty or workplace policy; serious or wilful neglect in the performance of your duties; being intoxicated at work; or engaging in conduct that causes risk to a person's health and safety or to the Employer's reputation, viability or profitability;",
      "Are convicted of an offence precluding or inhibiting the further performance of your duties;",
      "Cease to be legally entitled to perform work in Australia;",
      "Commit any act of bankruptcy or compound with creditors.",
    ]),
    empty(),
    p(
      "19.3 If notice of termination is given by either you or the Employer under this contract, the Employer may in its absolute discretion provide you with a payment in lieu of notice for all or part of the notice period.",
    ),
    empty(),
    p(
      "19.4 If notice of termination is given by either you or the Employer under this contract, the Employer may in its absolute discretion during all or part of the notice period direct you not to perform any duties, require you to remain away from the Employer's premises, require you not to have any dealing with customers or clients of the Employer, and/or change your duties.",
    ),
    empty(),
    p(
      "19.5 You will remain an employee of the Employer during the notice period and you must not commence work with any other person or entity during this period.",
    ),
    empty(),
    p(
      "19.6 On termination of your employment, you must immediately return to the Employer all company property that is in your possession, custody or control including but not limited to: all documents, Confidential Information, company equipment, software, computers, credit cards, keys, vehicles and property leased by the Employer.",
    ),

    // 20. Deductions
    heading(2, "20. Deductions"),
    p(
      "20.1 You agree that, to the extent permitted by law, the Employer may make deductions from any amount payable to you:",
    ),
    bulletList([
      "Where the deduction amount relates to any overpayment of wages or other benefit or entitlement (including without limitation paid leave in advance of accrual);",
      "Where the deduction amount relates to the reasonable cost or repair of any equipment or property damaged, lost or not returned to the Employer;",
      "Where you do not serve out your full notice period on termination but are required to do so by the Employer. The deduction amount will be equivalent to the value of the remuneration you would have earned during the balance of the notice period, and you acknowledge that this constitutes a reasonable estimate of the damage to the Employer arising from your failure to serve out the full notice period; and/or",
      "Of any other amount permissible by law.",
    ]),
    empty(),
    p(
      "20.2 You acknowledge that these deductions will be to your benefit as they will discharge any debts owed by you to the Employer.",
    ),
    empty(),
    p(
      "20.3 You agree to execute any separate written document necessary to give effect to any such deduction.",
    ),
    empty(),
    p(
      "20.4 This clause will survive the termination of your employment, irrespective of the basis of the termination, and shall remain in full force and effect indefinitely.",
    ),

    // 21. General
    heading(2, "21. General"),
    p(
      "21.1 This contract will continue to apply to your employment notwithstanding any change to your position, duties, hours of work, remuneration or location, unless otherwise agreed in writing.",
    ),
    empty(),
    p(
      "21.2 This contract constitutes the entire agreement between you and the Employer with respect to its subject matter, and supersedes any prior written or other agreement between you and the Employer to the extent permitted by law.",
    ),
    empty(),
    p(
      "21.3 After execution, the terms of this contract may not be changed or modified in any way other than as contemplated by this contract, unless it is in writing signed by both you and the Employer.",
    ),
    empty(),
    p(
      "21.4 This contract will terminate on the termination of your employment, save for those clauses which are expressly stated throughout this contract to survive termination.",
    ),
    empty(),
    p(
      "21.5 This contract is governed by the laws of the jurisdiction of your usual place of employment as described in clause 2.1.",
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
