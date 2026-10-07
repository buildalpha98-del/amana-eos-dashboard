/**
 * The short, plain-English versions of the KEY policies every new starter
 * must read and sign before their first shift (2026-10-08, Daniel).
 *
 * Written from the real policies in SharePoint ("NSW & VIC state policies"):
 *   - QA4 Code of Conduct Policy OSHC V8 (reviewed Jan 2026)
 *   - QA7 Privacy and Confidentiality Policy OSHC V16 (reviewed Mar 2026)
 * They are a summary, never a replacement: the sign screen always links the
 * full policy, and staff agree to the FULL policy.
 *
 * Defaults only — an admin can override a document's summary on the
 * Policies page (PolicyDocument.summary), which wins over these. When a
 * policy is re-versioned, re-check the summary still matches.
 *
 * Keyed by the normalised title (same normalisation the SharePoint sync
 * uses), with the older hand-uploaded titles mapped too.
 */

const CODE_OF_CONDUCT = `**Children's safety, rights and best interests come first — always.** This is what everyone at Amana agrees to.

### With children
- Supervise actively and properly at all times — children never leave your sight or care.
- Treat every child with respect, warmth and fairness. No favourites, no put-downs, no climate of fear.
- Never use abusive, sexual or offensive language or gestures, and never touch a child inappropriately.
- Never encourage a child to be alone with an adult in a private setting.
- Listen when a child tells you they, or another child, are unsafe or worried — and act on it.
- Value every child's culture, language, background and ability, including Aboriginal and Torres Strait Islander children and children with disability.

### Phones and devices
- **No personal phone, smartwatch with a camera, or other recording device on you while you're working with children.** Keep them away and use them only on breaks or in planning time.
- Only Amana-issued devices may be used to take photos or videos of children.
- Children never use your phone or any personal device.

### You're a mandatory reporter
- If you think a child is at risk of harm, abuse or neglect, you **must** report it to your coordinator or the approved provider (and the authorities where required). Never ignore it or play it down.
- Report any staff behaviour towards children that worries you (the Reportable Conduct Scheme).
- Keep your **Working With Children Check** current and tell us within 24 hours if anything about it changes.

### At work
- Be professional, honest and respectful with children, families and colleagues. Bullying, harassment, discrimination and racism are never okay — report them if you see them.
- No alcohol, drugs, smoking or vaping at work — and never come to work affected by them.
- Don't accept money, gifts that could look like favouritism, or bribes from families.
- Wear your uniform and name badge, enclosed shoes, and keep good personal hygiene.
- Keep everything about children, families and the service confidential (see the Privacy Policy).
- No negative posts about Amana, children, families or colleagues on social media. We recommend not adding families as friends.
- If you babysit for a family outside Amana, tell us first — there's a waiver to sign.

### If the Code is broken
Serious or repeated breaches can lead to disciplinary action, up to and including termination. Raising a concern is part of your job — you can do it in person, in writing, or anonymously.`;

const PRIVACY = `**Families trust us with very personal information. Protecting it is part of keeping children safe.**

### What you'll see at work
Children's names, birthdays, addresses, medical needs, allergies, family situations, court orders, incident reports, and photos. Families' contact, payment and Centrelink details. Your colleagues' personal details.

### Your responsibilities
- **Don't discuss a child with anyone except that child's own family** — unless it's for planning their care with the team.
- Only share what a colleague needs to know to care for a child (for example, an allergy).
- Never share information about other children, families or staff — including with other families at the same centre.
- Keep records at the centre and in the system. Don't copy them, take them home, or put them on personal devices, USBs or personal cloud storage.
- **Never share your passwords**, and log out of shared devices.
- Photos and videos of children are taken **only on Amana devices**, only for the purposes families have agreed to, and never posted or shared anywhere else.
- If you see photos of our children shared online, tell your coordinator.
- Send any media enquiries straight to the coordinator or approved provider — don't comment yourself.

### When information can be shared
Only with the child's family, the regulator or authorised officers, child protection authorities when a child may be at risk, or where the law requires it. If you're unsure, ask your coordinator before you share anything.

### If something goes wrong
If information is lost, sent to the wrong person, or seen by someone who shouldn't see it, **tell your coordinator straight away** — some breaches must be reported to the Australian privacy regulator.

### When you leave
Your duty of confidentiality continues after you finish at Amana — don't access accounts or use anything you learned here.

Breaching privacy and confidentiality can lead to disciplinary action.`;

export const DEFAULT_KEY_POLICY_SUMMARIES: Record<string, string> = {
  codeofconductpolicy: CODE_OF_CONDUCT,
  childsafecodeofconduct: CODE_OF_CONDUCT,
  privacyandconfidentialitypolicy: PRIVACY,
  privacypolicy: PRIVACY,
};

export const normaliseTitle = (title: string) => title.toLowerCase().replace(/[^a-z0-9]/g, "");

/** True for the policies every new starter must sign by default. */
export function isDefaultKeyPolicyTitle(title: string): boolean {
  return normaliseTitle(title) in DEFAULT_KEY_POLICY_SUMMARIES;
}

/** The admin-written summary if there is one, else our default, else null. */
export function effectiveSummary(doc: { title: string; summary: string | null }): string | null {
  return doc.summary?.trim() || DEFAULT_KEY_POLICY_SUMMARIES[normaliseTitle(doc.title)] || null;
}
