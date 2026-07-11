/**
 * NQS (National Quality Standard, 2018) taxonomy — the fixed structure behind
 * the NSW Service Self-Assessment Form and the ACECQA QIP: 7 quality areas,
 * 15 standards, 40 elements (each with its official "concept" label), plus the
 * NSW form's per-QA Law & Regulations checklist questions.
 *
 * Element/standard wording is ACECQA-published and verified against a real
 * NSW SAT export (ASR-00051099, 2026). Content lives in the DB; THIS file is
 * structure only — do not store per-service text here.
 */

export const EVIDENCE_SLOTS = 5;

export interface NqsStandard {
  code: string; // "1.1"
  qualityArea: number;
  title: string;
}

export interface NqsElement {
  code: string; // "1.1.1"
  standardCode: string; // "1.1"
  qualityArea: number;
  concept: string; // official concept label, e.g. "Approved learning framework"
  description: string;
}

export interface NqsLegalCheck {
  checkKey: string; // stable key, e.g. "qa1-01"
  qualityArea: number;
  lawRef: string; // "R.73", "S.168", "R.90-91, R.162"
  nqsRef: string; // "STD1.1"
  question: string;
}

export const QA_NAMES: Record<number, string> = {
  1: "Educational Program and Practice",
  2: "Children's Health and Safety",
  3: "Physical Environment",
  4: "Staffing Arrangements",
  5: "Relationships with Children",
  6: "Collaborative Partnerships",
  7: "Governance and Leadership",
};

export const NQS_STANDARDS: NqsStandard[] = [
  { code: "1.1", qualityArea: 1, title: "The educational program enhances each child's learning and development." },
  { code: "1.2", qualityArea: 1, title: "Educators facilitate and extend each child's learning and development." },
  { code: "1.3", qualityArea: 1, title: "Educators and co-ordinators take a planned and reflective approach to implementing the program for each child." },
  { code: "2.1", qualityArea: 2, title: "Each child's health and physical activity is supported and promoted." },
  { code: "2.2", qualityArea: 2, title: "Each child is protected." },
  { code: "3.1", qualityArea: 3, title: "The design of the facilities is appropriate for the operation of a service." },
  { code: "3.2", qualityArea: 3, title: "The service environment is inclusive, promotes competence and supports exploration and play-based learning." },
  { code: "4.1", qualityArea: 4, title: "Staffing arrangements enhance children's learning and development." },
  { code: "4.2", qualityArea: 4, title: "Management, educators and staff are collaborative, respectful and ethical." },
  { code: "5.1", qualityArea: 5, title: "Respectful and equitable relationships are maintained with each child." },
  { code: "5.2", qualityArea: 5, title: "Each child is supported to build and maintain sensitive and responsive relationships." },
  { code: "6.1", qualityArea: 6, title: "Respectful relationships with families are developed and maintained and families are supported in their parenting role." },
  { code: "6.2", qualityArea: 6, title: "Collaborative partnerships enhance children's inclusion, learning and wellbeing." },
  { code: "7.1", qualityArea: 7, title: "Governance supports the operation of a quality service." },
  { code: "7.2", qualityArea: 7, title: "Effective leadership builds and promotes a positive organisational culture and professional learning community." },
];

export const NQS_ELEMENTS: NqsElement[] = [
  { code: "1.1.1", standardCode: "1.1", qualityArea: 1, concept: "Approved learning framework", description: "Curriculum decision making contributes to each child's learning and development outcomes in relation to their identity, connection with community, wellbeing, confidence as learners and effectiveness as communicators." },
  { code: "1.1.2", standardCode: "1.1", qualityArea: 1, concept: "Child-centred", description: "Each child's current knowledge, strengths, ideas, culture, abilities and interests are the foundation of the program." },
  { code: "1.1.3", standardCode: "1.1", qualityArea: 1, concept: "Program learning opportunities", description: "All aspects of the program, including routines, are organised in ways that maximise opportunities for each child's learning." },
  { code: "1.2.1", standardCode: "1.2", qualityArea: 1, concept: "Intentional teaching", description: "Educators are deliberate, purposeful, and thoughtful in their decisions and actions." },
  { code: "1.2.2", standardCode: "1.2", qualityArea: 1, concept: "Responsive teaching and scaffolding", description: "Educators respond to children's ideas and play and extend children's learning through open-ended questions, interactions and feedback." },
  { code: "1.2.3", standardCode: "1.2", qualityArea: 1, concept: "Child directed learning", description: "Each child's agency is promoted, enabling them to make choices and decisions that influence events and their world." },
  { code: "1.3.1", standardCode: "1.3", qualityArea: 1, concept: "Assessment and planning cycle", description: "Each child's learning and development is assessed or evaluated as part of an ongoing cycle of observation, analysing learning, documentation, planning, implementation and reflection." },
  { code: "1.3.2", standardCode: "1.3", qualityArea: 1, concept: "Critical reflection", description: "Critical reflection on children's learning and development, both as individuals and in groups, drives program planning and implementation." },
  { code: "1.3.3", standardCode: "1.3", qualityArea: 1, concept: "Information for families", description: "Families are informed about the program and their child's progress." },
  { code: "2.1.1", standardCode: "2.1", qualityArea: 2, concept: "Wellbeing and comfort", description: "Each child's wellbeing and comfort is provided for, including appropriate opportunities to meet each child's need for sleep, rest and relaxation." },
  { code: "2.1.2", standardCode: "2.1", qualityArea: 2, concept: "Health practices and procedures", description: "Effective illness and injury management and hygiene practices are promoted and implemented." },
  { code: "2.1.3", standardCode: "2.1", qualityArea: 2, concept: "Healthy lifestyle", description: "Healthy eating and physical activity are promoted and appropriate for each child." },
  { code: "2.2.1", standardCode: "2.2", qualityArea: 2, concept: "Supervision", description: "At all times, reasonable precautions and adequate supervision ensure children are protected from harm and hazard." },
  { code: "2.2.2", standardCode: "2.2", qualityArea: 2, concept: "Incident and emergency management", description: "Plans to effectively manage incidents and emergencies are developed in consultation with relevant authorities, practised and implemented." },
  { code: "2.2.3", standardCode: "2.2", qualityArea: 2, concept: "Child protection", description: "Management, educators and staff are aware of their roles and responsibilities to identify and respond to every child at risk of abuse or neglect." },
  { code: "3.1.1", standardCode: "3.1", qualityArea: 3, concept: "Fit for purpose", description: "Outdoor and indoor spaces, buildings, fixtures and fittings are suitable for their purpose, including supporting the access of every child." },
  { code: "3.1.2", standardCode: "3.1", qualityArea: 3, concept: "Upkeep", description: "Premises, furniture and equipment are safe, clean and well maintained." },
  { code: "3.2.1", standardCode: "3.2", qualityArea: 3, concept: "Inclusive environment", description: "Outdoor and indoor spaces are organised and adapted to support every child's participation and to engage every child in quality experiences in both built and natural environments." },
  { code: "3.2.2", standardCode: "3.2", qualityArea: 3, concept: "Resources support play-based learning", description: "Resources, materials and equipment allow for multiple uses, are sufficient in number, and enable every child to engage in play-based learning." },
  { code: "3.2.3", standardCode: "3.2", qualityArea: 3, concept: "Environmentally responsible", description: "The service cares for the environment and supports children to become environmentally responsible." },
  { code: "4.1.1", standardCode: "4.1", qualityArea: 4, concept: "Organisation of educators", description: "The organisation of educators across the service supports children's learning and development." },
  { code: "4.1.2", standardCode: "4.1", qualityArea: 4, concept: "Continuity of staff", description: "Every effort is made for children to experience continuity of educators at the service." },
  { code: "4.2.1", standardCode: "4.2", qualityArea: 4, concept: "Professional collaboration", description: "Management, educators and staff work with mutual respect and collaboratively, and challenge and learn from each other, recognising each other's strengths and skills." },
  { code: "4.2.2", standardCode: "4.2", qualityArea: 4, concept: "Professional standards", description: "Professional standards guide practice, interactions and relationships." },
  { code: "5.1.1", standardCode: "5.1", qualityArea: 5, concept: "Positive educator to child interactions", description: "Responsive and meaningful interactions build trusting relationships which engage and support each child to feel secure, confident and included." },
  { code: "5.1.2", standardCode: "5.1", qualityArea: 5, concept: "Dignity and rights of the child", description: "The dignity and rights of every child are maintained." },
  { code: "5.2.1", standardCode: "5.2", qualityArea: 5, concept: "Collaborative learning", description: "Children are supported to collaborate, learn from and help each other." },
  { code: "5.2.2", standardCode: "5.2", qualityArea: 5, concept: "Self-regulation", description: "Each child is supported to regulate their own behaviour, respond appropriately to the behaviour of others and communicate effectively to resolve conflicts." },
  { code: "6.1.1", standardCode: "6.1", qualityArea: 6, concept: "Engagement with the service", description: "Families are supported from enrolment to be involved in the service and contribute to service decisions." },
  { code: "6.1.2", standardCode: "6.1", qualityArea: 6, concept: "Parent views are respected", description: "The expertise, culture, values and beliefs of families are respected and families share in decision-making about their child's learning and wellbeing." },
  { code: "6.1.3", standardCode: "6.1", qualityArea: 6, concept: "Families are supported", description: "Current information is available to families about the service and relevant community services and resources to support parenting and family wellbeing." },
  { code: "6.2.1", standardCode: "6.2", qualityArea: 6, concept: "Transitions", description: "Continuity of learning and transitions for each child are supported by sharing information and clarifying responsibilities." },
  { code: "6.2.2", standardCode: "6.2", qualityArea: 6, concept: "Access and participation", description: "Effective partnerships support children's access, inclusion and participation in the program." },
  { code: "6.2.3", standardCode: "6.2", qualityArea: 6, concept: "Community engagement", description: "The service builds relationships and engages with its community." },
  { code: "7.1.1", standardCode: "7.1", qualityArea: 7, concept: "Service philosophy and purpose", description: "A statement of philosophy guides all aspects of the service's operations." },
  { code: "7.1.2", standardCode: "7.1", qualityArea: 7, concept: "Management systems", description: "Systems are in place to manage risk and enable the effective management and operation of a quality service." },
  { code: "7.1.3", standardCode: "7.1", qualityArea: 7, concept: "Roles and responsibilities", description: "Roles and responsibilities are clearly defined, and understood, and support effective decision-making and operation of the service." },
  { code: "7.2.1", standardCode: "7.2", qualityArea: 7, concept: "Continuous improvement", description: "There is an effective self-assessment and quality improvement process in place." },
  { code: "7.2.2", standardCode: "7.2", qualityArea: 7, concept: "Educational leadership", description: "The educational leader is supported and leads the development and implementation of the educational program and assessment and planning cycle." },
  { code: "7.2.3", standardCode: "7.2", qualityArea: 7, concept: "Development of professionals", description: "Educators, co-ordinators and staff members' performance is regularly evaluated and individual plans are in place to support learning and development." },
];

export const ELEMENT_BY_CODE = new Map(NQS_ELEMENTS.map((e) => [e.code, e]));
export const STANDARD_BY_CODE = new Map(NQS_STANDARDS.map((s) => [s.code, s]));

export function elementsForQa(qa: number): NqsElement[] {
  return NQS_ELEMENTS.filter((e) => e.qualityArea === qa);
}

export const ELEMENT_ASSESSMENTS = ["not_assessed", "met", "not_met"] as const;
export const LEGAL_ASSESSMENTS = [
  "not_assessed",
  "compliant",
  "non_compliant",
  "not_applicable",
] as const;
export const IMPROVEMENT_PRIORITIES = ["low", "medium", "high"] as const;
export const IMPROVEMENT_STATUSES = ["not_started", "in_progress", "completed"] as const;

/**
 * NSW SAT "Law and Regulations" checklist questions, extracted from the NSW
 * Service Self-Assessment Form (ASR-00051099). checkKey is the stable storage
 * key — never renumber existing keys.
 */
export const NQS_LEGAL_CHECKS: NqsLegalCheck[] = [
  { checkKey: "qa1-01", qualityArea: 1, lawRef: "R.73", nqsRef: "STD1.1", question: "Have you developed a program that contributes to each child's learning and development outcomes outlined by the learning framework?" },
  { checkKey: "qa1-02", qualityArea: 1, lawRef: "S.168", nqsRef: "STD1.1", question: "Is either the Early Years Learning Framework (EYLF) or My Time, Our Place: Framework for School Age Care used to guide the development of the program?" },
  { checkKey: "qa1-03", qualityArea: 1, lawRef: "R.76", nqsRef: "STD1.3", question: "If requested, do you provide families with: • information about the content of the program and service routines and how they operate in relation to their children, including children's participation? • a copy of their children's assessment/evaluation documentation?" },
  { checkKey: "qa1-04", qualityArea: 1, lawRef: "R.74", nqsRef: "STD1.3", question: "If you have children who are preschool age or younger, do you document: • an assessment of each child's development, interests and participation in the program? • an assessment of each child's progress towards the program outcomes? If you have school age children, do you document: • how and why the education program has been developed to support all children to participate in the program." },
  { checkKey: "qa1-05", qualityArea: 1, lawRef: "R.75", nqsRef: "STD1.3", question: "Is the information about the program displayed in a place at the service that is accessible to parents? Is a copy of the program available for inspection on request: • at the service for long day care, preschool or outside school hours care, OR • at each educator's residence or venue for family day care?" },
  { checkKey: "qa2-01", qualityArea: 2, lawRef: "R.77", nqsRef: "STD2.1", question: "Is food stored, handled and served safely?" },
  { checkKey: "qa2-02", qualityArea: 2, lawRef: "R.90-91, R.162", nqsRef: "STD2.1", question: "Have you ensured that all educators and families are aware of the medical conditions policy and always follow it?" },
  { checkKey: "qa2-03", qualityArea: 2, lawRef: "R.88", nqsRef: "STD2.1", question: "Have you ensured that all educators and families follow the service's policies and procedures around preventing and dealing with the outbreak of infectious diseases?" },
  { checkKey: "qa2-04", qualityArea: 2, lawRef: "R.85-87", nqsRef: "STD2.1", question: "Have you ensured that all educators follow service procedures in the event of an accident, injury or illness?" },
  { checkKey: "qa2-05", qualityArea: 2, lawRef: "R.78-79", nqsRef: "STD2.1", question: "Do you ensure that food and drinks served to children are consistent with your nutrition policy and that children can access water at any time?" },
  { checkKey: "qa2-06", qualityArea: 2, lawRef: "R.89", nqsRef: "STD2.1", question: "Do you have sufficient first aid kits? Have you checked that they are fully stocked and removed all out-of-date items?" },
  { checkKey: "qa2-07", qualityArea: 2, lawRef: "R.80", nqsRef: "STD2.1", question: "Do you display an accurate menu if you provide food at your service?" },
  { checkKey: "qa2-08", qualityArea: 2, lawRef: "R.84A-B, R.168(2)(a)", nqsRef: "STD2.1", question: "(v) Have you ensured that you meet each child's need for sleep and/or rest? Have you ensured that all educators and families are aware of the sleep and rest policy and procedures and always follow them?" },
  { checkKey: "qa2-09", qualityArea: 2, lawRef: "R.92-96, R.161", nqsRef: "STD2.1", question: "Have you ensured that all educators, families and, where applicable, children are aware of the procedure for administering medication and always follow it?" },
  { checkKey: "qa2-10", qualityArea: 2, lawRef: "R.102A-F", nqsRef: "STD2.2", question: "Are there clear policies and procedures in place to ensure all requirements are met in relation to the transportation of children other than as part of an excursion. This includes embarking and disembarking at the service premise, risk assessments, authorisations, safe arrival of children." },
  { checkKey: "qa2-11", qualityArea: 2, lawRef: "R.165-166", nqsRef: "STD2.2", question: "For a family day care service; have you ensured that all family day care educators follow service procedures about visitors to the residence or family day care venue?" },
  { checkKey: "qa2-12", qualityArea: 2, lawRef: "R.97-98", nqsRef: "STD2.2", question: "Have you ensured that plans are developed to manage emergencies and evacuations and are displayed near each exit? Do you conduct a risk assessment at least every 12 months to identify the potential emergencies that could occur at your service? Are emergency and evacuation procedures practiced at least every 3 months?" },
  { checkKey: "qa2-13", qualityArea: 2, lawRef: "R.97(1)", nqsRef: "STD2.2", question: "If your service is located in a multi -story building shared with other occupants and with no direct exit to an assembly area, do your evacuation procedures include the required information?" },
  { checkKey: "qa2-14", qualityArea: 2, lawRef: "R.84C", nqsRef: "STD2.2", question: "Do you conduct a sleep and rest risk assessment at least every 12 months and as soon as required? Does your risk assessment consider the required matters?" },
  { checkKey: "qa2-15", qualityArea: 2, lawRef: "R.168", nqsRef: "STD2.2", question: "Have you ensured that all educators follow service procedures in relation to providing a child safe environment, including the promotion of a culture of child safety and wellbeing, and the safe use of online environments?" },
  { checkKey: "qa2-16", qualityArea: 2, lawRef: "S.165", nqsRef: "STD2.2", question: "Have you ensured that educators are supervising children effectively?" },
  { checkKey: "qa2-17", qualityArea: 2, lawRef: "R.99", nqsRef: "STD2.2", question: "Have you ensured that all educators follow service procedures about the delivery and collection of children from the service?" },
  { checkKey: "qa2-18", qualityArea: 2, lawRef: "R.84, S.162A", nqsRef: "STD2.2", question: "Have you ensured that all staff members, volunteers and students are aware of their child protection responsibilities? Have you ensured that all persons in day-to-day charge, nominated supervisors, and FDC co- ordinators have completed an approved child protection training course as required in NSW?" },
  { checkKey: "qa2-19", qualityArea: 2, lawRef: "R.100-102", nqsRef: "STD2.2", question: "Have you ensured that all educators follow service procedures in relation to excursions, including obtaining authorisations and conducting appropriate annual risk assessments?" },
  { checkKey: "qa2-20", qualityArea: 2, lawRef: "R.82-83, R.97, R.103, S.167", nqsRef: "STD2.2", question: "Have you ensured that all educators follow service procedures designed to ensure the environment is safe and that children cannot access dangerous items?" },
  { checkKey: "qa3-01", qualityArea: 3, lawRef: "R.104-115", nqsRef: "STD3.1", question: "Have you ensured the services premises, venue or residence meets all regulatory requirements? For example: • There is the required amount of unencumbered space for the number of children in attendance at the service • Arrangements for dealing with soiled clothes, linen and nappies • If you have children who are preschool age or younger, have fencing that prevents them going over, under or through it? • Are there appropriate toilet, hand washing and nappy change facilities? • Is there space for administrative functions and consultation with families? • Is there adequate light, ventilation and shade? • Are all areas of the premises easily supervised?" },
  { checkKey: "qa3-02", qualityArea: 3, lawRef: "R.103", nqsRef: "STD3.1", question: "Have you ensured that the service premises, venue or residence and all equipment and furniture are safe, clean and in good repair?" },
  { checkKey: "qa3-03", qualityArea: 3, lawRef: "R.116-117, R.116, R.34", nqsRef: "STD3.1", question: "(f)(iii) If you have a family day care service: • Have you ensured that all educators' residences or approved venues are assessed as safe before children are placed in care, and at least annually? • Have you ensured that glazed areas of all educators' residences or approved venues meet the required safety standard, and comply with the 0.75m height requirement? • Do swimming pools have a fence that complies with NSW Law? Are monthly inspections of swimming pools and water hazards conducted and an inspection report completed? • After conducting an inspection has a written report been prepared including the required information within set timeframes and a copy given to the educator(s)? • Do you require educators to inform you of any alterations or renovations to their premises? • For family day care services operating from a venue, have you submitted an application for approval to operate from a venue?" },
  { checkKey: "qa3-04", qualityArea: 3, lawRef: "R.105", nqsRef: "STD3.1", question: "Have you ensured that each child being cared for has access to sufficient furniture, materials and developmentally appropriate equipment suitable for that child?" },
  { checkKey: "qa3-05", qualityArea: 3, lawRef: "R.113", nqsRef: "STD3.2", question: "Have you ensured that children are able to explore and experience the natural environment? For example are there trees, plants and sand?" },
  { checkKey: "qa4-01", qualityArea: 4, lawRef: "R.136", nqsRef: "STD4.1", question: "Have you ensured that at all times children are in attendance at the service there is at least one person with a first aid qualification available, and at least one person who has completed training in the management of asthma and anaphylaxis?" },
  { checkKey: "qa4-02", qualityArea: 4, lawRef: "R.145-154", nqsRef: "STD4.1", question: "Have you ensured that all records relating to staff at the service are maintained and include all of the required information? Including; • Records for nominated supervisors, each educator, educator assistant, coordinator and staff member, volunteer and student? • The name of the educational leader and responsible person? • A record of educators working directly with children? • A record of access to an early childhood teacher (if required by R.152)? • A register of family day care educators (where applicable) including evidence that the educator is adequately monitored and supported by a family day care coordinator while the educator is providing education and care to children ?" },
  { checkKey: "qa4-03", qualityArea: 4, lawRef: "R.153, R.154", nqsRef: "STD4.1", question: "For family day care services; • Have you ensured that you maintain a register of educators, coordinators and assistants? • Does the register include details of exceptional circumstances when the approved provider has approved educators to operate above the required ratio of children?" },
  { checkKey: "qa4-04", qualityArea: 4, lawRef: "R.122-124", nqsRef: "STD4.1", question: "Have you ensured that the educator to child ratio is maintained and that only educators working directly with children are included in ratio?" },
  { checkKey: "qa4-05", qualityArea: 4, lawRef: "R.117A, R.117B", nqsRef: "STD4.1", question: "R. 117C Have you taken reasonable steps to ensure that the nominated supervisors and person in day-to-day charge has adequate knowledge and understanding of the provision of education and care to children and an ability to effectively supervise and manage an education and care service?" },
  { checkKey: "qa4-06", qualityArea: 4, lawRef: "R.119, R.123A, R.127-", nqsRef: "STD4.1", question: "128, R.136, R.143A, R. 143B, R.144 For family day care services; • Have you ensured that all educators and educator assistants are at least 18 years of age? • Have you ensured that all coordinators hold an approved diploma level qualification? • Have you ensured all educators hold at least an approved certificate III qualification, unless they are actively working towards at least an approved certificate III level qualification immediately before 1 July 2023 • Ensure that all educators and educator assistants hold an approved first aid qualification and have completed an approved training in the management of asthma and anaphylaxis? • How do you ensure each family day care educator engaged by or registered with the service maintains an adequate knowledge and understanding of the provision of education and care to children? • Is there a process in place to ensure serious incidents and complaints are adequately addressed? • Does your FDC Coordinator provide adequate monitoring and support to educators? • Have you taken reasonable steps to ensure your educators have adequate knowledge and understanding of the provision of education and care to children? • If you employ educator assistants,do you ensure you and the educator assistant comply with the requirements of R.144?" },
  { checkKey: "qa4-07", qualityArea: 4, lawRef: "R.120, R.126, R.129-135", nqsRef: "STD4.1", question: "If you are a long day care or preschool or outside school hours care service, • Have you ensured that educators who are under 18 years of age do not work alone and are adequately supervised? • Have you ensured that educators required to meet the ratio hold or are actively working towards the qualifications applicable in your state and territory?" },
  { checkKey: "qa4-08", qualityArea: 4, lawRef: "R.123A", nqsRef: "STD4.1", question: "For family day care services; Have you ensured that coordinators to educator ratios are maintained?" },
  { checkKey: "qa5-01", qualityArea: 5, lawRef: "R.155", nqsRef: "STD5.1", question: "Have you ensured that educators interact with children in a way that; • Encourage children to express themselves and their opinions? • Support children to develop self-reliance and self-esteem? • Maintain the dignity and rights of each child? • Provide positive guidance and encourage acceptable behaviour? • Reflect each child's family and cultural values? • Is appropriate for the physical and intellectual development and abilities of each child?" },
  { checkKey: "qa5-02", qualityArea: 5, lawRef: "R.156", nqsRef: "STD5.2", question: "Have you ensured that the size and composition of each group of children provides them with the opportunity to interact and develop respectful and positive relationships with each other and with educators?" },
  { checkKey: "qa6-01", qualityArea: 6, lawRef: "R.157", nqsRef: "STD6.1", question: "Do you respect the right of parents to enter the service when their child is in attendance unless; • Allowing the parent to come into the service poses a risk to the safety of children or staff? • Allowing the parent to come into the service would prevent you or educators and staff from carrying out your normal duties, such as supervising children, delivering the program or meeting health and safety needs? or • You reasonably believe that allowing them entry would contravene a court order?" },
  { checkKey: "qa7-01", qualityArea: 7, lawRef: "R.168-169, R.170-171", nqsRef: "STD7.1", question: "Do you have all prescribed policies and procedures in place at the service? Do you ensure that your policies and procedures are followed? And always available?" },
  { checkKey: "qa7-02", qualityArea: 7, lawRef: "R.87, R.158-162", nqsRef: "STD7.1", question: "Have you ensured that all records relating to children at the service are maintained, including enrollment records, excursions, attendance records, health information, records of illness or accident?" },
  { checkKey: "qa7-03", qualityArea: 7, lawRef: "S.173-174, R.174-176", nqsRef: "STD7.1", question: "Do you ensure that changes to the operation and premises of the service, serious incidents, matters relating to health, safety and wellbeing of children and complaints which allege a breach of the Law or Regulations are reported to the Regulatory Authority in the required timeframes? This includes any changes to the ages of children being educated and cared for at the service and any change to the nature of care offered by the service." },
  { checkKey: "qa7-04", qualityArea: 7, lawRef: "R.146, R.147, R.154, R.163", nqsRef: "STD7.1", question: "Have you ensured that, where applicable, records of working with children clearances are kept for • The nominated supervisors, educators, coordinators and staff? • Family day care educator assistants? • Adults living in residences used to provide a family day care service? • Students and volunteers?" },
  { checkKey: "qa7-05", qualityArea: 7, lawRef: "R.118, R.148", nqsRef: "STD7.1", question: "Have you ensured that a suitably qualified and experienced individual has been appointed as the educational leader at the service and that this person's name is included in the staff record?" },
  { checkKey: "qa7-06", qualityArea: 7, lawRef: "R.185", nqsRef: "STD7.1", question: "Have you ensured that a copy of the Law and Regulations can be accessed by educators, staff, volunteers and families, including those seeking to enroll their child at the service?" },
  { checkKey: "qa7-07", qualityArea: 7, lawRef: "R.176A", nqsRef: "STD7.1", question: "For family day care services, have you ensured educators notify the approved provider about circumstances that may pose risks to the safety, health or wellbeing of children at or likely to attend the service. Including renovations, an infectious disease outbreak or a natural disaster." },
  { checkKey: "qa7-08", qualityArea: 7, lawRef: "S.172, R.173", nqsRef: "STD7.1", question: "Do you display all prescribed information? Is it clearly visible from the main entrance of the service or residence?" },
  { checkKey: "qa7-09", qualityArea: 7, lawRef: "R.172", nqsRef: "STD7.1", question: "Have you ensured that families are informed at least 14 days before changes are made to service policies or procedures that might have a significant impact on them, including changes in fees and the way they are collected?" },
  { checkKey: "qa7-10", qualityArea: 7, lawRef: "R.181-184", nqsRef: "STD7.1", question: "Have you ensured that records are stored appropriately to ensure confidentiality and are retained for the period indicated in R.183?" },
  { checkKey: "qa7-11", qualityArea: 7, lawRef: "R.29, R.180", nqsRef: "STD7.1", question: "Do you keep information about public liability insurance for your service on the premises?" },
  { checkKey: "qa7-12", qualityArea: 7, lawRef: "R.92, R.99, R.177", nqsRef: "STD7.1", question: "Have you ensured that records related to children contain all the required information including authorisations for the administration of medication, medical treatment, the collection of children from the service and excursions?" },
  { checkKey: "qa7-13", qualityArea: 7, lawRef: "R.165", nqsRef: "STD7.2", question: "For family day care services, have you ensured that records of visitors to a residence or approved venue are maintained?" },
  { checkKey: "qa7-14", qualityArea: 7, lawRef: "R.55-56, R.31", nqsRef: "STD7.2", question: "Have you ensured that your Quality Improvement Plan • Contains a statement of the service philosophy? • Is reviewed and revised at least annually?" },
];
