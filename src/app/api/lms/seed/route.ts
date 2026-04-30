import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
/**
 * POST /api/lms/seed
 *
 * Owner-only endpoint that seeds comprehensive LMS training courses
 * based on The Amana Way handbook and OSHC industry requirements.
 * Safe to call multiple times — skips courses that already exist by title.
 *
 * Run from browser console:
 *   fetch('/api/lms/seed', { method: 'POST' }).then(r => r.json()).then(console.log)
 */

type ModuleDef = {
  title: string;
  description?: string;
  type: "document" | "video" | "quiz" | "checklist" | "external_link";
  content?: string;
  resourceUrl?: string;
  duration?: number;
  isRequired: boolean;
};

type CourseDef = {
  title: string;
  description: string;
  category: string;
  isRequired: boolean;
  status: "published" | "draft";
  modules: ModuleDef[];
};

const ALL_COURSES: CourseDef[] = [
  // ──────────────────────────────────────────────
  // 1. THE AMANA WAY — Core Induction
  // ──────────────────────────────────────────────
  {
    title: "The Amana Way — Educator Induction",
    description:
      "Your essential introduction to Amana OSHC. Covers our vision, mission, IHSAN values, cultural framework, daily routines, and what it means to be an Amana educator. Based directly on The Amana Way employee handbook.",
    category: "Induction",
    isRequired: true,
    status: "published",
    modules: [
      {
        title: "Welcome to Amana OSHC",
        description:
          "CEO welcome message, company background, and what makes Amana different. Understand our founding principles of Amanah (trust) and Ihsan (excellence).",
        type: "document",
        content:
          "Welcome to Amana OSHC — a place where excellence, care and character guide everything we do.\n\nOur mission is simple: deliver world-class, compassionate and creative programs so children leave feeling stronger, brighter and more whole.\n\nKey Takeaways:\n- We lead with Ihsan — excellence in intention and action\n- Our values of Integrity, Hospitality, Service, Aspiration and Nurture guide how we care\n- Internally we uphold Fun, Reputation, Ihsan and being Doers\n- Every interaction matters — your professionalism, warmth and consistency help children feel secure",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Vision, Mission & IHSAN Values",
        description:
          "Deep dive into our Vision, Mission, and the 5 core values: Integrity, Hospitality, Service, Aspiration, Nurture. Learn the observable behaviours expected for each value.",
        type: "document",
        content:
          "VISION: The world's most inspiring afterschool experience — where every child unlocks hidden strengths, nurtures their spirit, and grows into who they were meant to be.\n\nMISSION: To deliver world-class and safe after school care rooted in compassion, creativity and character-building.\n\nIHSAN VALUES:\n- I — Integrity: Honour commitments, transparent fees, accurate incident reporting\n- H — Hospitality: Warm greetings to every parent, child-centred spaces, inclusive language\n- S — Service: Go the extra step — offer homework help, share developmental feedback\n- A — Aspiration: Continuous improvement, professional development, innovation mindset\n- N — Nurture: Safe ratios, proactive behaviour guidance, emotional coaching",
        duration: 15,
        isRequired: true,
      },
      {
        title: "Amana OSHC Philosophy",
        description:
          "Understand the 5 philosophical pillars that underpin all Amana OSHC practices: capable children, equity and inclusion, First Nations cultures, family partnerships, and best practice in education.",
        type: "document",
        content:
          "Amana OSHC Philosophy — 5 Pillars:\n\n1. Children are capable and confident learners — we view each child as competent and successful\n2. Equity, inclusion and diversity are fundamental — every child is valued regardless of background\n3. Australia's Aboriginal and Torres Strait Islander cultures are honoured — embedded in daily practices\n4. Families are key partners in their child's development — strong collaborative relationships\n5. Best practice in education and care — ongoing professional development and reflective practices\n\nThis philosophy underpins every aspect of our service from policies and decision-making to educational practices.",
        duration: 10,
        isRequired: true,
      },
      {
        title: "The Amana Cultural Framework",
        description:
          "How we show up: our tone (warm, calm, respectful), how we greet families, how we speak to children, and the Islamic undertone of Ihsan, Amanah, and Adab.",
        type: "document",
        content:
          "THE AMANA WAY CULTURAL FRAMEWORK:\n\n1. Our Tone: Warm, Calm, Respectful\n- Smiling, welcoming, open body language\n- Measured tone, steady pace, confident presence\n- Polite phrasing, active listening, dignified responses\n\n2. How We Greet Families\n- Make eye contact, greet every parent within 5 seconds\n- End the day with gratitude and reassurance\n\n3. How We Speak to Children\n- Encouraging: praise effort and achievement\n- Inclusive: offer choices and invite participation\n- Regulating: co-regulate through calm guidance\n- Empowering: validate ideas and build confidence\n\nISLAMIC UNDERTONE:\n- Ihsan (Excellence): Give your best effort, even in small tasks\n- Amanah (Trust): Children are entrusted to our care\n- Adab (Good Character): Speak kindly, act with humility, show patience",
        duration: 15,
        isRequired: true,
      },
      {
        title: "Roles & Responsibilities",
        description:
          "Understand the Amana team structure: Area Manager, Coordinator, 2IC Educators, and Educators. Know your role, who you report to, and your core responsibilities.",
        type: "document",
        content:
          "AMANA OSHC TEAM STRUCTURE:\n\n1. Area Manager — manages regions, ensures safety and compliance, reports to OSHC Director\n2. Coordinator (Centre Director) — experienced in childcare/OSHC, Educational Leader of the program\n3. 2IC Educators — second in charge at larger services, supports Coordinator, working towards becoming a Coordinator\n4. Educators — make up largest part of the team, priority is engaging with children, helps run the program\n\nCORE EDUCATOR RESPONSIBILITIES:\n- Build positive relationships with children, families, and colleagues\n- Implement the My Time Our Place (MTOP) framework\n- Assist with planning, delivering and evaluating educational experiences\n- Uphold child-safe standards and mandatory reporting requirements\n- Maintain confidentiality, professionalism and compliance",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Staff Uniform & Professional Presentation",
        description:
          "Uniform requirements, acceptable work attire, and the Amana professional presentation standard.",
        type: "document",
        content:
          "UNIFORM PROVIDED:\n- 1x T-Shirt, 1x Zip-Up Jacket, 1x Bucket Hat (Terms 1 & 4), 1x Lanyard and ID tag\n\nACCEPTABLE ATTIRE:\n- Full or 3/4 length trousers or pants\n- Leggings/activewear must be thick material (not see-through)\n- Skirts/shorts must be below knee length\n- Closed toe shoes only — appropriate for high energy activities\n- Full Amana OSHC uniform at all times\n\nNO personal devices during shift — must be stored away at the start of your shift.",
        duration: 5,
        isRequired: true,
      },
      {
        title: "The Amana 'How We Show Up' Checklist",
        description:
          "Before, during, and after shift expectations. The daily checklist every Amana educator follows.",
        type: "checklist",
        content:
          "BEFORE YOUR SHIFT:\n☐ Arrive on time, uniform neat, devices away\n☐ Greet your team with warmth\n☐ Review supervision zones, menu, and plan\n☐ Ask 'What can I help set up?'\n☐ Enter the room with positive energy\n\nDURING YOUR SHIFT:\n☐ Stay present, engaged, and proactive\n☐ Speak kindly and calmly — to children, families and school staff\n☐ Keep the environment safe and inviting\n☐ Support your team without being asked\n☐ Look for chances to encourage and uplift\n\nTOWARDS END OF SHIFT:\n☐ Support pack-down and leave spaces spotless\n☐ Complete reflections, posts and checklists properly\n☐ Leave the service better than you found it\n☐ Thank your team before you go",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Amana Principles: Fun, Doer, Reputation",
        description:
          "Beyond IHSAN, every team member contributes to 3 key principles: Fun, being a Doer, and protecting our Reputation.",
        type: "document",
        content:
          "THE AMANA PRINCIPLES:\n\n1. FUN — Ask yourself:\n- Do children and families feel joy here?\n- Would I enjoy this space if I were a child or parent?\n- Are children excited to join the program each day?\n\n2. DOER — Ask yourself:\n- Am I stepping up or stepping back?\n- Did I take initiative today without waiting to be asked?\n- Am I helping the team, or adding to their workload?\n\n3. REPUTATION — Ask yourself:\n- What impression do we leave behind?\n- What do families see, hear and feel when they arrive?\n- Would a parent confidently recommend us based on today's service?",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Amana Way Induction Quiz",
        description:
          "Test your understanding of The Amana Way — vision, values, philosophy, cultural framework, and daily expectations.",
        type: "quiz",
        content:
          "Q1: What does IHSAN stand for in Amana's values?\nA: Integrity, Hospitality, Service, Aspiration, Nurture\n\nQ2: What are the 3 internal principles every team member upholds?\nA: Fun, Doer, Reputation\n\nQ3: What is the meaning of 'Amanah'?\nA: Trust — children are entrusted to our care\n\nQ4: How quickly should you greet a parent upon their approach?\nA: Within 5 seconds\n\nQ5: What are the 3 qualities of the Amana tone?\nA: Warm, Calm, Respectful\n\nQ6: What is our vision?\nA: The world's most inspiring afterschool experience\n\nQ7: Name the 5 philosophical pillars of Amana OSHC.\nA: Capable children, equity/inclusion, First Nations cultures, family partnerships, best practice\n\nQ8: What does 'Adab' mean?\nA: Good character and manners — modelled through action",
        duration: 10,
        isRequired: true,
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 2. DAILY OPERATIONS
  // ──────────────────────────────────────────────
  {
    title: "Daily Operations & Routines",
    description:
      "Step-by-step guide to running a successful OSHC session — from arrival and setup through to pack-down and closing. Covers the 9-step Amana daily operation process.",
    category: "Operations",
    isRequired: true,
    status: "published",
    modules: [
      {
        title: "Step 1: Arrival, Setup & Team Briefing",
        description:
          "Arrive by 2:30 PM, sign in, complete opening checklist, set up activity areas, prepare food, and hold team briefing.",
        type: "document",
        content:
          "LOGGED ON: OWNA > Checklists tab > Opening Checklist\n\nSTEPS:\n1. Arrive by 2:30 PM, sign in on OWNA, greet the team, check supervision zones and menu\n2. Complete Opening Checklist, set up activity areas, prepare food, ensure hygiene and safety\n3. Hold a team briefing reviewing daily menu, activities, alerts, and roles — log meeting notes on OWNA\n\nEXPECTATION: All educators must contribute ideas, clarify supervision responsibilities, and ensure readiness before children arrive.\n\nCOMPLIANCE: Regulation 97-168 for supervision, safety, and documentation.",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Step 2: Child Collection & Safe Arrival",
        description:
          "Collect children from classrooms, sign in on OWNA iPad, cross-check attendance, and report discrepancies.",
        type: "document",
        content:
          "LOGGED ON: OWNA > Attendance > Sign In / Out\n\nSTEPS:\n1. Set up pick-up point flag outside service location\n2. Collect children safely from classrooms or meeting points — greet them warmly\n3. Sign in each child immediately on OWNA iPad\n4. Cross-check attendance — report any discrepancies to Coordinator immediately\n\nCOMPLIANCE: Regulation 99 (Children leaving the service) and Regulation 158 (Attendance records).",
        duration: 8,
        isRequired: true,
      },
      {
        title: "Step 3: Group Connection & Acknowledgement of Country",
        description:
          "Gather children, deliver Acknowledgement of Country, outline daily program and expectations.",
        type: "document",
        content:
          "LOGGED ON: OWNA > Staff meetings and minutes tab\n\nSTEPS:\n1. Gather children calmly and ensure everyone is present\n2. Deliver Acknowledgement of Country respectfully with child participation\n3. Outline the daily program and expectations — log this short meeting in OWNA\n\nCOMPLIANCE: Supports Quality Area 6 — Collaborative partnerships with families and communities.",
        duration: 5,
        isRequired: true,
      },
      {
        title: "Step 4: Activity Time & OWNA Posts",
        description:
          "Engage children in activities, take approved photos, create and upload daily posts on OWNA linked to MTOP outcomes.",
        type: "document",
        content:
          "LOGGED ON: OWNA > Press middle plus button > Create Post\n\nSTEPS:\n1. Engage and supervise children in activities, extending learning through questioning\n2. Take approved photos — avoid clear faces, demonstrate learning or teamwork\n3. Write a fun daily post on activities linking to MTOP outcomes\n4. Upload post on OWNA and share approved summary to WhatsApp group\n\nEXPECTATION: Posts must reflect meaningful engagement and highlight learning, skill-building, or social development.\n\nCOMPLIANCE: Regulation 181 regarding confidentiality of records.",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Step 5: Food Service & Hygiene",
        description:
          "Prepare and serve food following hygiene protocols, check allergies, and record in OWNA.",
        type: "document",
        content:
          "LOGGED ON: OWNA > Daily Menu Plan & Food Safety Checklist\n\nSTEPS:\n1. Prepare and serve food following hygiene protocols and daily menu\n2. Supervise and encourage healthy habits — check allergies and dietary notes\n3. Record food handling and menu completion in OWNA checklists\n4. Allow children to serve themselves with tongs or gloves\n\nCOMPLIANCE: Food Safety Standard 3.2.2A and Regulation 77 (Health, hygiene, safe food).",
        duration: 8,
        isRequired: true,
      },
      {
        title: "Step 6: Family Interactions & Sign Out",
        description:
          "Welcome families warmly, share positive updates, assist with sign-out, and encourage feedback.",
        type: "document",
        content:
          "LOGGED ON: OWNA > Attendance > Sign In / Out\n\nSTEPS:\n1. Welcome families warmly and share positive updates\n2. Assist parents in signing out via iPad — ensure correct time and PIN\n3. Encourage parents and children to fill in suggestions book\n4. Confirm children have belongings before departure — maintain supervision until transfer of care\n\nCOMPLIANCE: Supports Quality Area 6 and Regulation 157 (Access to information).",
        duration: 8,
        isRequired: true,
      },
      {
        title: "Step 7: Daily Reflection on OWNA",
        description:
          "Reflect on the session individually and as a team. Upload critical reflection on OWNA linking to MTOP outcomes.",
        type: "document",
        content:
          "LOGGED ON: OWNA > Staff reflections tab > Click Plus button\n\nSTEPS:\n1. Reflect individually and with the team on what worked and what can improve\n2. Analyse how activities supported MTOP outcomes and children's learning\n3. Write a critical reflection linking to MTOP and upload on OWNA\n4. Tag all children and provide insights for the next session\n\nCHATGPT REFLECTION PROMPT:\n'Write a critical reflection for today's OSHC session. Here is what we did: [activity details]. Here is how children engaged: [observations]. Link to MTOP outcomes, describe what worked well, what could be improved, and suggest next steps.'\n\nCOMPLIANCE: Quality Area 1 and 7; Regulation 55 (Quality Improvement Plans).",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Step 8: Pack-Down & Closing Checklist",
        description:
          "Clean, sanitise, store resources, confirm all children signed out, and complete closing checklist.",
        type: "checklist",
        content:
          "LOGGED ON: OWNA > Daily Checklists > Closing Checklist\n\n☐ Clean and sanitise all activity areas\n☐ Safely store all resources and equipment\n☐ Confirm ALL children have been signed out\n☐ Lock up the environment and secure exits\n☐ Complete closing checklist on OWNA\n☐ Log any maintenance issues in OWNA\n☐ Send picture of cleaned service area to group chat\n☐ Debrief briefly with Coordinator if required\n\nCOMPLIANCE: Quality Area 2 and Regulation 168.",
        duration: 5,
        isRequired: true,
      },
      {
        title: "Step 9: Communication & Escalation Process",
        description:
          "Record parent feedback, notify Coordinator of incidents, and document follow-ups within 24 hours.",
        type: "document",
        content:
          "STEPS:\n1. Record parent feedback, incidents, or requests immediately in person\n2. Notify Coordinator of any behaviour, injury, or safety concern without delay\n3. Document follow-up or resolutions within 24 hours\n\nCOMPLIANCE: Quality Area 6 and Regulation 176 (Notifying certain information to the Regulatory Authority).",
        duration: 5,
        isRequired: true,
      },
      {
        title: "Daily Operations Quiz",
        description:
          "Test your knowledge of the 9-step Amana daily operation process.",
        type: "quiz",
        content:
          "Q1: What time must you arrive for an ASC shift?\nA: 2:30 PM\n\nQ2: Where do you log the opening checklist?\nA: OWNA > Checklists tab > Opening Checklist\n\nQ3: What must happen immediately when each child arrives?\nA: Sign in on OWNA iPad\n\nQ4: What must daily posts on OWNA link to?\nA: MTOP outcomes\n\nQ5: What must you check before serving food?\nA: Allergies and dietary notes\n\nQ6: When must reflections be uploaded?\nA: During the session — at 5:00 PM, complete daily reflection\n\nQ7: What do you send to the group chat after pack-down?\nA: Picture of cleaned service area\n\nQ8: Within what timeframe must follow-ups be documented?\nA: 24 hours",
        duration: 10,
        isRequired: true,
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 3. CHILD PROTECTION & MANDATORY REPORTING
  // ──────────────────────────────────────────────
  {
    title: "Child Protection & Mandatory Reporting",
    description:
      "Critical training on the Child Safe Standards, types of child abuse, mandatory reporting obligations, and Amana OSHC's child protection procedures. Legally required for all OSHC educators.",
    category: "Compliance",
    isRequired: true,
    status: "published",
    modules: [
      {
        title: "Child Safe Standards Overview",
        description:
          "The 7 Child Safe Standards and how they are implemented at Amana OSHC.",
        type: "document",
        content:
          "THE 7 CHILD SAFE STANDARDS:\n\nStandard 1: Strategies to embed an organisational culture of child safety through effective leadership\nStandard 2: A child safe policy or statement of commitment to child safety\nStandard 3: A code of conduct establishing clear expectations for behaviour with children\nStandard 4: Screening, supervision, training and HR practices that reduce risk of child abuse\nStandard 5: Processes for responding to and reporting suspected child abuse\nStandard 6: Strategies to identify and reduce or remove the risk of child abuse\nStandard 7: Strategies to promote the participation and empowerment of children\n\nOur services must also promote:\n- Cultural safety of children from culturally/linguistically diverse backgrounds including Aboriginal and Torres Strait Islander children\n- Safety of children with a disability",
        duration: 15,
        isRequired: true,
      },
      {
        title: "Types of Child Abuse — Recognition & Indicators",
        description:
          "Understand the four types of child abuse: physical, sexual, emotional, and neglect. Learn to recognise indicators and warning signs.",
        type: "document",
        content:
          "TYPES OF CHILD ABUSE:\n\n1. PHYSICAL ABUSE: Non-accidental injury or injuries inflicted by another person. Look for unexplained bruises, burns, fractures, or injuries inconsistent with explanations.\n\n2. CHILD SEXUAL ABUSE: Involves sexual acts or exposure to sexual behaviour inappropriate for the child's age. Includes touching, masturbation, penetration, exposure to pornography, and grooming.\n\n3. EMOTIONAL ABUSE: Repeated rejection, isolation, frightening by threats, witnessing family violence, hostility, name-calling, persistent coldness affecting emotional or psychological health.\n\n4. NEGLECT: Continual failure to provide necessities — clothing, food, hygiene, medical attention, shelter, supervision — compromising the child's wellbeing, safety and development.\n\nIMPORTANT: You do not need proof to report. If you suspect, you MUST report.",
        duration: 20,
        isRequired: true,
      },
      {
        title: "Mandatory Reporting — Your Legal Obligations",
        description:
          "Your legal responsibilities as a mandatory reporter. Who to contact, when to report, and the consequences of failing to report.",
        type: "document",
        content:
          "YOUR RESPONSIBILITIES:\n\n- You must be aware of your legal responsibilities\n- You must report any behaviours that indicate child abuse or grooming, particularly with team members\n- If uncertain, have discussions with your Area Operation Manager\n- Failure to report carries heavy fines, civil suit, and jail time\n- DET Authorised Officers may ask about your awareness during visits\n\nWHO TO CONTACT:\n- NSW: Child Protection Hotline — 13 2111\n- VIC: Child Protection Crisis Line — 131 278\n- WA: Central Intake Team — 1800 273 889\n\nEvery service has a poster with state-specific contact details.\n\nPROCESS:\n1. Recognise signs/concerns\n2. Report to Director of Service immediately\n3. Educators with Area Manager support will report to appropriate agency\n4. Actively seek feedback from agency after reporting\n5. Continue to support the child",
        duration: 15,
        isRequired: true,
      },
      {
        title: "Child Protection Quiz",
        description:
          "Assessment of your child protection knowledge and mandatory reporting obligations.",
        type: "quiz",
        content:
          "Q1: How many Child Safe Standards are there?\nA: 7\n\nQ2: Do you need proof before making a child protection report?\nA: No — if you suspect, you must report\n\nQ3: What is the NSW Child Protection Hotline number?\nA: 13 2111\n\nQ4: What are the 4 types of child abuse?\nA: Physical, sexual, emotional, and neglect\n\nQ5: What are the consequences of not reporting?\nA: Heavy fines, civil suit, and jail time\n\nQ6: Who do you report suspected abuse to first?\nA: Your Director of Service / Nominated Supervisor\n\nQ7: What does Standard 5 of the Child Safe Standards cover?\nA: Processes for responding to and reporting suspected child abuse\n\nQ8: Name an indicator of neglect.\nA: Failure to provide necessities like clothing, food, hygiene, medical attention, shelter, supervision",
        duration: 15,
        isRequired: true,
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 4. SUPERVISION & SAFETY
  // ──────────────────────────────────────────────
  {
    title: "Active Supervision & Child Safety",
    description:
      "Master the CLEAR supervision framework, understand ratio requirements, and learn how to handle high-risk scenarios including lost line of sight, bathroom supervision, and managing high-risk zones.",
    category: "Safety",
    isRequired: true,
    status: "published",
    modules: [
      {
        title: "The CLEAR Supervision Framework",
        description:
          "Amana's 5-point supervision model: Count, Line of Sight, Engage, Awareness, Response.",
        type: "document",
        content:
          "THE CLEAR FRAMEWORK:\n\nC — COUNT: Headcounts every 30 minutes\nL — LINE OF SIGHT: Ensure you have an unobstructed view of all children\nE — ENGAGE: Actively listen to and participate with children\nA — AWARENESS: Constantly scan the environment for risks\nR — RESPONSE: Be ready to act immediately in any situation\n\nKEY RULES:\n- Staff-child ratio must be maintained at all times\n- High risk areas must be supervised by highly experienced educators\n- High risk activities must have familiar and experienced educators\n- Ask to see the supervision plan at your first shift at a new service",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Ratio Requirements",
        description:
          "Know the educator-to-child ratios for all OSHC settings: standard, excursions, water activities, and specialist schools.",
        type: "document",
        content:
          "AMANA OSHC RATIOS:\n\n- Standard regulation ratio: 1:15\n- Low risk excursions: 1:11\n- High risk excursion: 1:8\n- Water based excursion: 1:5\n- Specialist Schools: 1:2\n\nIMPORTANT: If ratios drop due to staff being delayed or absent:\n1. Keep all children in a central, visible area\n2. Notify the Coordinator\n3. Adjust zones — no child should be left unsupervised\n4. Avoid high-risk activities until ratios are restored",
        duration: 8,
        isRequired: true,
      },
      {
        title: "Safety Scenarios — Real Situation Guides",
        description:
          "Quick-response guides for 7 common high-risk scenarios: lost line of sight, bathroom supervision, being alone with a child, high-risk zones, child trying to leave, ratio drops, and wet weather.",
        type: "document",
        content:
          "SCENARIO 1: Lost Line of Sight\n- Stop, scan, call name calmly, alert Coordinator\n- Check high-risk areas first (toilets, gates, exits)\n- If not found in 2 minutes: escalate as missing child\n\nSCENARIO 2: Bathroom Supervision\n- Position outside with full visibility of entry/exit\n- Keep door ajar, count children in/out\n- Never enter unless another staff member is aware\n\nSCENARIO 3: Alone With a Child\n- Move immediately to a visible area\n- Notify another educator, keep interactions professional\n- Always stay within line of sight of other staff\n\nSCENARIO 4: High-Risk Zones (Ovals/Playgrounds)\n- Spread staff to cover all angles, assign clear zones\n- Constant scanning, check for hazards\n- Watch bottleneck points on equipment\n\nSCENARIO 5: Child Tries to Leave\n- Move calmly to block exit\n- Say 'You are safe here. Let's work this out together'\n- Alert Coordinator, document incident\n- Never chase into unsafe areas\n\nSCENARIO 6: Ratio Drops\n- Keep all children central, notify Coordinator\n- No high-risk activities until restored\n\nSCENARIO 7: Wet Weather/Room Changes\n- Small groups, maintain line of sight\n- Reconfirm headcounts once settled\n- Transitions are the HIGHEST-risk moments",
        duration: 20,
        isRequired: true,
      },
      {
        title: "Non-Arrival & Missing Child Procedures",
        description:
          "What to do when a child doesn't arrive as expected, and the critical procedures for a missing child situation.",
        type: "document",
        content:
          "NON-ARRIVAL OF CHILDREN:\n- Follow the 'Keeping children safe: Non-arrival/missing child' process\n- This document is located in your OSHC office or operations policy manual\n- Child Safety is our priority — ensure ALL children are accounted for\n\nFOR FAMILIES: ALWAYS mark not attending, even if last minute\n\nAUTHORISATION TO COLLECT:\n- Persons collecting must be listed on enrolment form as parent/guardian or authorised emergency contact\n- Emergency contacts must produce photo ID and be over 18\n- Take photocopy of ID and add to enrolment form\n- Must have prior parent communication confirming emergency pickup",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Supervision & Safety Quiz",
        description: "Test your knowledge of the CLEAR framework, ratios, and safety scenarios.",
        type: "quiz",
        content:
          "Q1: What does CLEAR stand for?\nA: Count, Line of Sight, Engage, Awareness, Response\n\nQ2: How often should headcounts be done?\nA: Every 30 minutes\n\nQ3: What is the standard ratio?\nA: 1:15\n\nQ4: What is the water-based excursion ratio?\nA: 1:5\n\nQ5: If you lose line of sight and the child is not found, how long before escalating?\nA: 2 minutes\n\nQ6: Can you enter the bathroom when children are inside?\nA: Only if another staff member is aware and there's a safety need\n\nQ7: What are the highest-risk moments during a session?\nA: Transitions\n\nQ8: Who must produce photo ID when collecting a child?\nA: Emergency contacts not listed as primary parent/guardian",
        duration: 10,
        isRequired: true,
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 5. MEDICAL CONDITIONS & FIRST AID
  // ──────────────────────────────────────────────
  {
    title: "Medical Conditions & First Aid Management",
    description:
      "Managing children with medical conditions, administering medication, handling injuries and incidents, and understanding reportable incidents. Essential for every OSHC educator.",
    category: "Safety",
    isRequired: true,
    status: "published",
    modules: [
      {
        title: "Supporting Children with Medical Conditions",
        description:
          "Required documentation, medication storage, and communication plans for children with medical conditions.",
        type: "document",
        content:
          "REQUIRED DOCUMENTS BEFORE CHILD ATTENDS:\n- Medical action plan (current and signed by doctor)\n- Risk minimisation / communication plan (signed by parent)\n- Medication (in-date, original packaging, child's name, prescribed dosage)\n\nMEDICATION STORAGE:\n- Out of reach of children OR in a locked cupboard\n- If child attends with medical conditions, medication must be in service and with emergency evac bag\n\nCRITICAL RULE: At NO POINT should children with medical conditions attend without current action plan, risk minimisation/communication plan, and medication. Coordinator may refuse care if not provided.\n\nEXPIRED MEDICATIONS: Contact parent immediately, must be replaced before child attends again. Return expired medication to parent for disposal.",
        duration: 15,
        isRequired: true,
      },
      {
        title: "Administration of Medication",
        description:
          "Step-by-step procedures for safe medication administration in an OSHC setting.",
        type: "checklist",
        content:
          "MEDICATION ADMINISTRATION CHECKLIST:\n\n☐ Parent/guardian has signed medication authorisation form\n☐ Medication is in original package/container\n☐ Medication is in-date with child's full name\n☐ Prescribed dosage is clearly stated\n☐ Medication stored correctly (as recommended on package)\n☐ Medication is NOT in child's school bag\n☐ Two educators present for administration\n☐ Only prescribed dosage administered\n☐ Both educators sign medication authorisation form\n☐ Parent/guardian acknowledges administration and signs on collection\n\nIMPORTANT: Children are NOT to self-medicate. If medication does not meet requirements, it will NOT be administered.",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Managing Injuries, Incidents & Illness",
        description:
          "How to handle minor incidents, head injuries, and the documentation requirements for all incidents.",
        type: "document",
        content:
          "MINOR INCIDENTS:\n1. Perform first aid including all cuts, bruising and abrasions\n2. Complete Amana OSHC injury/accident/incident/trauma/illness report\n3. Inform parent on arrival and have them sign the report (can be signed via OWNA)\n4. File report with child's enrolment form on OWNA\n\nHEAD INJURIES:\n- MUST be reported to Area Manager immediately\n- Parent MUST be informed immediately REGARDLESS of severity\n\nBEFORE SCHOOL CARE:\n- If incident occurs during BSC, you must inform the school when releasing the child",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Reportable & Serious Incidents",
        description:
          "What constitutes a reportable incident, serious incident procedures, and ACECQA notification requirements.",
        type: "document",
        content:
          "REPORTABLE INCIDENTS:\n- Emergency service attends the service\n- Child seeks medical attention for injury at service\n- Broken/fractured bones\n- Head injury requiring medical attention\n- Child has not arrived at care (non-arrival/missing child)\n- Child unaccounted for during care for longer than 5 minutes\n- Loss of a child\n- Child locked in or out of the service\n- Child walked off school premises or licensed space\n- Asthma attack or Anaphylactic reaction where Epi pen administered\n- Death of a child\n\nSERIOUS INCIDENT PROCEDURE:\n1. Contact emergency services (000)\n2. Contact your Area Manager immediately\n3. Contact parent(s) immediately\n4. Area Manager MUST notify ACECQA within 24 hours\n5. Area Manager will inform school Principal\n\nAll serious incidents must be documented on the injury/accident/incident/trauma/illness report in a timely manner (time, date and steps taken).",
        duration: 15,
        isRequired: true,
      },
      {
        title: "Medical & First Aid Quiz",
        description: "Test your knowledge of medical conditions management and incident procedures.",
        type: "quiz",
        content:
          "Q1: What 3 documents must be provided before a child with medical conditions attends?\nA: Medical action plan, risk minimisation/communication plan, and medication\n\nQ2: How many educators must be present when administering medication?\nA: Two\n\nQ3: What must happen immediately with a head injury?\nA: Report to Area Manager AND inform parent immediately regardless of severity\n\nQ4: Within what timeframe must ACECQA be notified of a serious incident?\nA: 24 hours\n\nQ5: Can a child self-medicate at the service?\nA: No\n\nQ6: Where should medication be stored?\nA: Out of reach of children or in a locked cupboard\n\nQ7: What is the first step in a serious incident?\nA: Contact emergency services (000)\n\nQ8: What happens if medication is expired?\nA: Contact parent immediately — must be replaced before child attends again",
        duration: 10,
        isRequired: true,
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 6. BEHAVIOUR GUIDANCE
  // ──────────────────────────────────────────────
  {
    title: "Behaviour Guidance in OSHC",
    description:
      "Positive behaviour guidance strategies aligned with the National Quality Framework and MTOP. Learn how to guide children through calm, consistent, and nurturing interactions.",
    category: "Education",
    isRequired: true,
    status: "published",
    modules: [
      {
        title: "Amana Behaviour Guidance Principles",
        description:
          "The foundations of positive behaviour guidance at Amana — modelling, redirection, and empowerment.",
        type: "document",
        content:
          "KEY PRINCIPLES:\n\n- Every child has the right to feel safe, respected, and supported\n- We model positive, respectful, and calm behaviour at all times in tone and action\n- We use positive guidance techniques: redirection, choice-making, reflective conversation\n- Corporal punishment, isolation, or humiliation are STRICTLY PROHIBITED by law and policy\n\nEDUCATOR RESPONSIBILITIES:\n- Observe and document challenging behaviour using OWNA\n- Work collaboratively with families and allied professionals on Behaviour Guidance Plans\n- Support consistency between home and OSHC\n- Supervise actively to prevent conflicts and provide timely support\n\nKEY TAKEAWAYS:\n- Your tone, body language, and response set the emotional tone for children\n- Each child's behaviour is an opportunity for teaching and connection, not punishment\n- Behaviour plans must be individualised, inclusive, and documented\n- Incidents should be logged the same day through appropriate channels",
        duration: 15,
        isRequired: true,
      },
      {
        title: "Positive Language & De-Escalation Strategies",
        description:
          "Practical language scripts and de-escalation techniques aligned with the Amana cultural framework.",
        type: "document",
        content:
          "POSITIVE LANGUAGE SCRIPTS:\n\nInstead of 'Stop running!' → 'Walking feet inside please'\nInstead of 'Don't hit!' → 'We use gentle hands with our friends'\nInstead of 'Be quiet!' → 'Let's use our inside voices'\nInstead of 'You're being naughty' → 'I can see you're frustrated — let's talk about it'\n\nDE-ESCALATION STEPS:\n1. Stay calm — regulate yourself first\n2. Get to the child's level — eye contact, calm voice\n3. Acknowledge feelings: 'I can see you're upset'\n4. Offer choices: 'Would you like to take a break or try again?'\n5. Redirect: 'Let's find something that works for everyone'\n6. Follow up: check in later and praise positive choices\n\nAMANA SCRIPTS:\n- 'Let's take a breath together and figure this out'\n- 'You have great ideas — show me what you're thinking'\n- 'You've worked really hard on that — well done'\n- 'What would you like to try next?'",
        duration: 15,
        isRequired: true,
      },
      {
        title: "Behaviour Guidance Quiz",
        description: "Assessment of your behaviour guidance knowledge and strategies.",
        type: "quiz",
        content:
          "Q1: Is corporal punishment ever acceptable at Amana OSHC?\nA: No — it is strictly prohibited by law and policy\n\nQ2: Name 3 positive guidance techniques.\nA: Redirection, choice-making, reflective conversation\n\nQ3: Where should challenging behaviour be documented?\nA: On OWNA\n\nQ4: What is the first step in de-escalation?\nA: Stay calm — regulate yourself first\n\nQ5: When should incidents be logged?\nA: The same day they occur\n\nQ6: Who should be involved in developing Behaviour Guidance Plans?\nA: Educators, families, and where necessary allied professionals",
        duration: 10,
        isRequired: true,
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 7. MY TIME OUR PLACE (MTOP) FRAMEWORK
  // ──────────────────────────────────────────────
  {
    title: "My Time, Our Place (MTOP) Framework",
    description:
      "Understanding the MTOP Framework for School Age Care — the 5 Learning Outcomes, how to link activities to outcomes, and how to write meaningful reflections and observations.",
    category: "Education",
    isRequired: true,
    status: "published",
    modules: [
      {
        title: "Introduction to MTOP",
        description:
          "What is MTOP and why it matters for OSHC. Overview of the framework structure and its role in guiding educational programs.",
        type: "document",
        content:
          "MY TIME, OUR PLACE (MTOP):\n\nThe approved learning framework for School Age Care in Australia. It guides educators in developing quality programs that support children's wellbeing, learning and development.\n\nMTOP recognises:\n- The importance of play and leisure in children's learning\n- Children's competence, agency, and right to be active participants\n- The role of relationships and community in children's lives\n- The significance of cultural identity and belonging\n\nAt Amana OSHC, every activity, post, and reflection must link back to MTOP outcomes.",
        duration: 10,
        isRequired: true,
      },
      {
        title: "The 5 MTOP Learning Outcomes",
        description:
          "Deep dive into each of the 5 Learning Outcomes with practical examples for OSHC settings.",
        type: "document",
        content:
          "THE 5 MTOP LEARNING OUTCOMES:\n\nOUTCOME 1: Children have a strong sense of identity\n- Examples: Name games, cultural celebrations, 'All About Me' projects, acknowledging feelings\n\nOUTCOME 2: Children are connected with and contribute to their world\n- Examples: Community service projects, sustainability activities, pen pals, helping younger children\n\nOUTCOME 3: Children have a strong sense of wellbeing\n- Examples: Sports, cooking, yoga, mindfulness, hygiene routines, healthy eating discussions\n\nOUTCOME 4: Children are confident and involved learners\n- Examples: STEM experiments, art projects, construction play, problem-solving challenges\n\nOUTCOME 5: Children are effective communicators\n- Examples: Drama, storytelling, book clubs, debates, group discussions, digital literacy\n\nEach activity can link to multiple outcomes. When writing posts and reflections, identify which outcomes are being supported.",
        duration: 20,
        isRequired: true,
      },
      {
        title: "Writing MTOP-Linked Observations & Reflections",
        description:
          "How to write meaningful observations and critical reflections that link practice to MTOP outcomes.",
        type: "document",
        content:
          "WRITING OBSERVATIONS:\n- Describe what you saw/heard (factual, objective)\n- Identify which MTOP outcome(s) it links to\n- Analyse what the child demonstrated (skills, interests, development)\n- Plan next steps to extend learning\n\nWRITING REFLECTIONS:\n- What did we do today?\n- How did children engage?\n- Which MTOP outcomes were supported?\n- What worked well and what could improve?\n- What are the next steps for tomorrow's program?\n\nEXAMPLE:\n'Today children participated in a collaborative art project creating a mural about our community (Outcome 2). They worked together to plan the design (Outcome 5), shared materials willingly (Outcome 1), and problem-solved when paint colours ran out (Outcome 4). Tomorrow we will extend this by adding labels and creating a story about our community.'",
        duration: 15,
        isRequired: true,
      },
      {
        title: "MTOP Framework Quiz",
        description: "Test your understanding of the MTOP framework and its application.",
        type: "quiz",
        content:
          "Q1: How many Learning Outcomes does MTOP have?\nA: 5\n\nQ2: Which outcome relates to 'children have a strong sense of wellbeing'?\nA: Outcome 3\n\nQ3: Can one activity link to multiple MTOP outcomes?\nA: Yes\n\nQ4: What should a critical reflection include?\nA: What we did, how children engaged, MTOP links, what worked, what could improve, next steps\n\nQ5: Which outcome does a STEM experiment best link to?\nA: Outcome 4 — Children are confident and involved learners\n\nQ6: Which outcome does cultural celebration link to?\nA: Outcome 1 — Children have a strong sense of identity",
        duration: 10,
        isRequired: true,
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 8. FOOD SAFETY & HYGIENE
  // ──────────────────────────────────────────────
  {
    title: "Food Safety & Hygiene in OSHC",
    description:
      "Food safety standards, hygiene practices, allergy management, and the Woolworths at Work ordering system. Covers Food Safety Standard 3.2.2A and Regulation 77.",
    category: "Compliance",
    isRequired: true,
    status: "published",
    modules: [
      {
        title: "Food Safety Standards & Hygiene",
        description:
          "Safe food handling, hygiene protocols, contamination prevention, and correct storage methods.",
        type: "document",
        content:
          "FOOD SAFETY AT AMANA OSHC:\n\n- Follow daily menu plan and food safety checklist on OWNA\n- Wash hands before and after handling food\n- Wear gloves and use tongs for serving\n- Check allergies and dietary requirements before every meal\n- Store food as recommended on packaging\n- Monitor food temperatures\n- Clean and sanitise preparation areas\n- Allow children to serve themselves with tongs or gloves\n\nCOMPLIANCE: Food Safety Standard 3.2.2A and Regulation 77\n\nREQUIRED QUALIFICATIONS:\n- All educators: SITXFSA005 — Use Hygienic Practices for Food Safety\n- Responsible Person / 2IC+: SITXFSA006 — Participate in Safe Food Handling (Supervisor)\n- Amana covers 50% of course costs",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Allergy Management & Dietary Requirements",
        description:
          "Managing allergies, anaphylaxis procedures, and accommodating diverse dietary needs in OSHC.",
        type: "document",
        content:
          "ALLERGY MANAGEMENT:\n\n1. Check medical action plans at the start of every session\n2. Review daily menu against known allergies\n3. Separate preparation areas for allergen-free meals\n4. Label all food clearly\n5. Never allow food sharing between children\n6. Know the location of Epi-pens and medication\n7. Two staff must be trained in anaphylaxis management\n\nDIETARY REQUIREMENTS:\n- Halal dietary requirements apply across all Amana OSHC services\n- Accommodate vegetarian, vegan, and cultural dietary needs\n- Record all dietary information on OWNA\n- Communicate with families about menu changes",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Woolworths at Work — Food Ordering SOP",
        description:
          "How to use the Woolworths at Work platform for weekly food ordering within budget.",
        type: "checklist",
        content:
          "FOOD ORDERING CHECKLIST:\n\n☐ Check student attendances in OWNA and adjust for casual bookings\n☐ Confirm weekly budget using Budget Tool (Google Drive > Amana OSHC Schools > Administration > Budget Tools)\n☐ Log into Woolworths at Work (atwork.woolworths.com.au)\n☐ Select delivery date with minimum 2-hour window during operating hours\n☐ Select 'Menu Plan & Order' from toolbar\n☐ Choose meals within budget\n☐ Swap unavailable items if required\n☐ Review cart — replace branded/unseasonal items\n☐ Check dollars per gram/kilo for value\n☐ Add disposables (gloves, cutlery)\n☐ For orders under $99, opt for pick-up (min $50)\n☐ Add delivery window and driver notes\n☐ Add substitution requirements\n☐ Place order and wait for confirmation\n☐ Record order total on budget spreadsheet\n☐ If remaining balance, shop external suppliers and upload receipts to SharePoint",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Food Safety Quiz",
        description: "Test your food safety and hygiene knowledge.",
        type: "quiz",
        // Multi-choice format — see src/lib/quiz-parser.ts for the syntax.
        // Each question has 4 options labelled A) through D); the correct
        // answer is marked with " (correct)". Optional `Explanation:` line
        // displays after the user submits.
        content: [
          "Q1: What regulation covers food safety in OSHC?",
          "A) Food Standards Code alone",
          "B) Food Safety Standard 3.2.2A and Regulation 77 (correct)",
          "C) Education and Care Services National Law",
          "D) Local council health bylaws",
          "Explanation: NSW OSHC services follow Food Safety Standard 3.2.2A under the Australia New Zealand Food Standards Code, plus Regulation 77 of the National Regulations.",
          "",
          "Q2: What food safety qualification must all educators hold?",
          "A) Certificate III in Children's Services",
          "B) HLTAID012 First Aid only",
          "C) SITXFSA005 — Use Hygienic Practices for Food Safety (correct)",
          "D) No qualification needed — kitchen staff handle all food",
          "Explanation: Every educator who handles food at a service requires SITXFSA005, because they may serve, supervise, or assist with meals.",
          "",
          "Q3: What must you check before every meal service?",
          "A) Children are seated and quiet",
          "B) Allergies and dietary requirements (correct)",
          "C) The educator-to-child ratio",
          "D) Menu has been printed and posted",
          "Explanation: Allergy + dietary checks come first every time — even for repeat menus — because new enrolments may change what's safe to serve.",
          "",
          "Q4: Where is the Budget Tool located?",
          "A) On the laptop in the kitchen",
          "B) OWNA admin dashboard",
          "C) Google Drive > Amana OSHC Schools > Administration > Budget Tools (correct)",
          "D) Manager's email inbox",
          "",
          "Q5: What is the minimum order value for Woolworths pick-up?",
          "A) $25",
          "B) $50 (correct)",
          "C) $100",
          "D) No minimum",
          "",
          "Q6: What percentage of course costs does Amana cover?",
          "A) 25%",
          "B) 50% (correct)",
          "C) 75%",
          "D) 100%",
        ].join("\n"),
        duration: 10,
        isRequired: true,
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 9. EMERGENCY MANAGEMENT & EVACUATION
  // ──────────────────────────────────────────────
  {
    title: "Emergency Management & Evacuation",
    description:
      "Emergency preparedness, evacuation procedures, lockdown protocols, and drill requirements. Covers Regulations 97-99 of the Education and Care Services National Regulations.",
    category: "Safety",
    isRequired: true,
    status: "published",
    modules: [
      {
        title: "Emergency & Evacuation Procedures",
        description:
          "Know the Emergency and Evacuation Plan — exit routes, assembly points, emergency kits, and your role during emergencies.",
        type: "document",
        content:
          "EDUCATOR RESPONSIBILITIES:\n\n- Know the Emergency and Evacuation Plan including ALL exit routes and assembly points\n- Participate in emergency drills every 3 months — treat each as real\n- Remain calm and provide clear, reassuring instructions to children\n- Keep all exits and evacuation routes clear of obstacles at ALL times\n- Ensure emergency kits and first aid supplies are accessible and stocked\n- Follow directions of Nominated Supervisor or Fire Warden immediately\n- Account for EVERY child using attendance records and conduct roll calls\n- Report any safety concerns that could impact emergency response\n- Complete Emergency Drill Record or Incident Report after each rehearsal or event\n\nCOMPLIANCE: Regulations 97-99\n\nKEY TAKEAWAY: Stay calm — children will mirror your response.",
        duration: 15,
        isRequired: true,
      },
      {
        title: "Emergency Response Scenarios",
        description:
          "Practical guides for fire, lockdown, medical emergency, severe weather, and intruder scenarios.",
        type: "document",
        content:
          "FIRE:\n1. Sound alarm, call 000\n2. Evacuate using nearest safe exit\n3. Assemble at designated point\n4. Roll call — account for every child\n5. Do NOT re-enter the building\n\nLOCKDOWN:\n1. Lock all doors and windows\n2. Move children away from doors/windows\n3. Keep children calm and quiet\n4. Take roll call\n5. Wait for all-clear from emergency services\n\nMEDICAL EMERGENCY:\n1. Call 000 if life-threatening\n2. Administer first aid\n3. Contact Area Manager and parents immediately\n4. Document everything\n5. Monitor child until emergency services arrive\n\nSEVERE WEATHER:\n1. Move all children indoors\n2. Close windows and doors\n3. Move away from glass\n4. Take roll call\n5. Monitor weather updates\n\nDRILL FREQUENCY: Every 3 months — it's a legal requirement, not optional.",
        duration: 15,
        isRequired: true,
      },
      {
        title: "Emergency Management Quiz",
        description: "Assessment of emergency preparedness knowledge.",
        type: "quiz",
        content:
          "Q1: How often must emergency drills be conducted?\nA: Every 3 months\n\nQ2: What is the first thing you do in a fire emergency?\nA: Sound alarm and call 000\n\nQ3: Which regulations cover emergency procedures?\nA: Regulations 97-99\n\nQ4: Should you re-enter a building during a fire evacuation?\nA: No\n\nQ5: What must you complete after every drill or real emergency?\nA: Emergency Drill Record or Incident Report\n\nQ6: What should you do if a child is panicking during evacuation?\nA: Stay calm — children mirror your response — give clear, reassuring instructions",
        duration: 10,
        isRequired: true,
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 10. WORKPLACE POLICIES & COMPLIANCE
  // ──────────────────────────────────────────────
  {
    title: "Workplace Policies & Professional Conduct",
    description:
      "Code of Conduct, privacy and confidentiality, complaints handling, digital technology use, WHS obligations, and sick leave procedures. Everything you need to know about professional standards.",
    category: "Compliance",
    isRequired: true,
    status: "published",
    modules: [
      {
        title: "Code of Conduct",
        description:
          "Professional, ethical, and behavioural standards expected of all Amana OSHC staff.",
        type: "document",
        content:
          "CODE OF CONDUCT — KEY REQUIREMENTS:\n\n- Act professionally, respectfully, and lawfully at all times\n- Maintain appropriate boundaries with children and families\n- Use positive communication — avoid gossip, sarcasm, or harmful language\n- Respect confidentiality — never share private information\n- Follow lawful directions from supervisors\n- Dress appropriately and maintain professional appearance\n- Be punctual, reliable, and committed to teamwork\n- Address conflicts through proper channels\n\nPROHIBITED CONDUCT:\n- Any form of child abuse, neglect, grooming, or corporal punishment\n- Bullying, harassment, discrimination, or intimidation\n- Inappropriate physical contact or communication with children\n- Unauthorised photography or use of personal devices\n- Alcohol, illicit substances, vaping, or smoking on premises\n- Breaches of privacy or misuse of confidential information\n\nBREACHES: May result in disciplinary action up to and including termination.",
        duration: 15,
        isRequired: true,
      },
      {
        title: "Privacy & Confidentiality",
        description:
          "Your obligations under the Privacy Act 1988 and Australian Privacy Principles regarding child, family, and staff information.",
        type: "document",
        content:
          "PRIVACY OBLIGATIONS:\n\n- Maintain strict confidentiality — never discuss child/family details with unauthorised persons\n- Use information only for legitimate work-related purposes\n- Keep digital and paper records secure — lock cabinets, password-protect devices, log out\n- Conversations about children only in private, professional settings\n- Obtain parental consent before photos, videos, or displays\n- Report any data breach immediately to management\n- Dispose of records securely when authorised\n\nCOMPLIANCE: Privacy Act 1988 and Australian Privacy Principles (APPs)\n\nKEY RULE: Never share child or family information outside authorised communication channels.",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Digital Technology & Device Policy",
        description:
          "Rules for using digital technologies, personal devices, and protecting children's privacy online.",
        type: "document",
        content:
          "CRITICAL RULE: NO USE OF PERSONAL DEVICES — must be stored away at the start of your shift.\n\n- Use only approved Amana OSHC devices (OWNA, service email accounts)\n- Never store or share children's photos/videos on personal phones or social media\n- Obtain written parental consent before capturing any image of a child\n- Keep passwords secure, log out of all systems after use\n- Report any cyber-security breach immediately\n- Model safe and responsible online behaviour\n- Remember: anything shared digitally may become permanent\n\nCOMPLIANCE: Privacy Act 1988 and Australian Privacy Principles (APPs)",
        duration: 8,
        isRequired: true,
      },
      {
        title: "Complaints Handling",
        description:
          "How to handle complaints from families and the staff grievance process.",
        type: "document",
        content:
          "FAMILY COMPLAINTS:\n- Handle calmly, professionally, and without bias\n- Record and report using appropriate documentation\n- Notify Nominated Supervisor immediately if serious/child safety concern\n- Notifiable complaints must be reported to Regulatory Authority within 24 hours\n- Maintain strict confidentiality\n- View complaints as opportunities to learn\n\nSTAFF GRIEVANCES:\n- Address minor issues directly and respectfully first\n- Raise unresolved matters with Nominated Supervisor/Director\n- Submit written grievance if verbal discussions fail\n- Maintain confidentiality and professionalism\n- Written response provided within 7 working days\n- May bring a support person to meetings\n- External mediation available if needed\n\nKEY PRINCIPLE: Raise concerns early — silence makes problems worse.",
        duration: 10,
        isRequired: true,
      },
      {
        title: "WHS & Sick Leave",
        description:
          "Work Health and Safety obligations and sick leave procedures.",
        type: "document",
        content:
          "WHS RESPONSIBILITIES:\n- Take reasonable care for your own health and safety and that of others\n- Follow all safe work procedures\n- Identify and report hazards, near misses, and unsafe conditions\n- Participate in WHS training, safety meetings, and emergency drills\n- Use PPE correctly when required\n- Keep work areas clean and free of trip hazards\n- Follow correct manual handling techniques\n\nSICK LEAVE:\n- Do NOT attend work if experiencing infectious symptoms\n- Inform Nominated Supervisor as soon as possible\n- Provide medical certificate when requested\n- Adhere to exclusion periods for contagious illnesses\n- Keep immunisations up to date\n\nSHIFT CANCELLATION NOTICE:\n- BSC shifts: 2:30 PM the day before\n- ASC shifts: 10:00 AM the day of\n- Holiday programs: 2:30 PM the day before",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Policies & Compliance Quiz",
        description: "Assessment of workplace policies and professional conduct knowledge.",
        type: "quiz",
        content:
          "Q1: Can you use your personal phone during a shift?\nA: No — must be stored away at the start of your shift\n\nQ2: Within what timeframe must notifiable complaints be reported to the Regulatory Authority?\nA: 24 hours\n\nQ3: How much notice must you give to cancel an ASC shift?\nA: By 10:00 AM the day of the shift\n\nQ4: What happens if you breach the Code of Conduct?\nA: Disciplinary action up to and including termination\n\nQ5: Can you discuss a child's behaviour with another parent?\nA: No — strict confidentiality applies\n\nQ6: Within what timeframe will staff receive a written response to a grievance?\nA: 7 working days\n\nQ7: Is vaping allowed on service premises?\nA: No — strictly prohibited",
        duration: 10,
        isRequired: true,
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 11. OWNA PLATFORM TRAINING
  // ──────────────────────────────────────────────
  {
    title: "OWNA Platform Training",
    description:
      "Complete guide to using OWNA — the platform Amana OSHC uses for attendance, checklists, reflections, posts, rostering, and compliance documentation.",
    category: "Systems",
    isRequired: true,
    status: "published",
    modules: [
      {
        title: "OWNA Overview & Setup",
        description:
          "Getting started with OWNA: downloading the app, logging in, checking your information, setting notifications.",
        type: "document",
        content:
          "GETTING STARTED:\n\n1. Download the OWNA app on your phone\n2. Accept the invite when added to the system\n3. Check that your personal information is correct\n4. Add in unavailability / days you cannot work\n5. Make sure notifications are ON\n6. Have your PIN code ready for signing in on the service iPad\n\nOWNA IS USED FOR:\n- Attendance (sign in/out)\n- Daily checklists (opening/closing)\n- Posts and parent communication\n- Staff reflections\n- Meeting minutes\n- Rostering and leave\n- Incident/injury reports\n- Compliance documentation",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Attendance & Sign In/Out",
        description: "How to use OWNA for child attendance tracking and parent sign-out procedures.",
        type: "document",
        content:
          "OWNA > Attendance > Sign In / Out\n\n- Sign each child in immediately upon arrival on OWNA iPad\n- Cross-check attendance and report discrepancies to Coordinator\n- Parents sign children out via iPad with correct time and PIN\n- Follow up unexplained absences immediately\n- Record arrival times accurately\n\nCOMPLIANCE: Regulation 158 (Attendance records) and Regulation 99 (Children leaving the service)",
        duration: 8,
        isRequired: true,
      },
      {
        title: "Creating Posts & Linking to MTOP",
        description:
          "Step-by-step guide to creating daily posts on OWNA that link to MTOP outcomes and share with families.",
        type: "document",
        content:
          "HOW TO CREATE A POST:\n\n1. Press middle plus button in OWNA\n2. Select 'Create Post'\n3. Fill out the post content\n4. Press person icon — tag ALL children involved\n5. Click tick (top right)\n6. Press ribbon at bottom — change EYLF to MTOP in dropdown\n7. Click tick (top right)\n8. Press book — attach to weekly program\n9. Press camera — attach photos (avoid clear faces)\n10. Press top right arrow to post\n11. Copy post and pics — send to Amana OSHC WhatsApp groups\n\nPOSTS MUST: Reflect meaningful engagement and highlight learning, skill-building, or social development.",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Reflections, Checklists & Meeting Notes",
        description:
          "How to upload reflections, complete daily checklists, and log meeting minutes on OWNA.",
        type: "document",
        content:
          "REFLECTIONS:\nOWNA > Staff reflections tab > Click Plus > Fill in Reflection > Ensure NOT draft > Post\n- Must be analytical, linking MTOP outcomes and improvement opportunities\n- Upload by 5:00 PM\n\nCHECKLISTS:\nOWNA > Checklists tab > Opening/Closing Checklist\n- Complete opening checklist before children arrive\n- Complete closing checklist during pack-down\n\nMEETING NOTES:\nOWNA > Staff meetings and minutes tab > Press plus > Fill out during meeting\n- Log mini meetings and team briefings\n- Record group connection meetings with children",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Rostering & Leave Requests",
        description: "How to view your roster and submit leave requests through OWNA.",
        type: "document",
        content:
          "VIEWING YOUR ROSTER:\n- Rosters are published through OWNA\n- Most rosters published 1 week in advance\n- Shifts are subject to change based on daily requirements\n\nSUBMITTING LEAVE:\n1. Go to Show Roster in the Actions Menu\n2. Click the + icon in the bottom right corner\n3. Enter leave request details: Title, Upload medical certificate (optional), Start Date/Time, End Date/Time, Description (what leave entitlements to use)\n4. Press arrow button (top right) to submit\n\nIMPORTANT: Keep notifications on for roster updates.",
        duration: 8,
        isRequired: true,
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 12. AMANA SCRIPTS & COMMUNICATION
  // ──────────────────────────────────────────────
  {
    title: "Amana Scripts & Family Communication",
    description:
      "The official Amana OSHC Script System — warm, respectful, child-centred, Islamic-inspired hospitality scripts for every situation from greetings to difficult conversations.",
    category: "Communication",
    isRequired: true,
    status: "published",
    modules: [
      {
        title: "Greeting & Daily Conversation Scripts",
        description:
          "Standard greetings for drop-off, pick-up, phone calls, and daily conversations with families.",
        type: "document",
        content:
          "GREETING SCRIPTS:\n\nParent Drop-Off: 'Assalamu alaikum! We're glad to have [child] with us this morning.'\nParent Pick-Up: 'Welcome back! Let me share a quick highlight from their session.'\nVisitors/School Staff: 'Assalamu alaikum, thank you for dropping by — how can we help you?'\n\nPHONE SCRIPTS:\nAnswering: 'Assalamu alaikum, Amana OSHC, how can we help you today?'\nVoicemail: 'Assalamu alaikum, you've reached Amana OSHC. Please leave your name, your child's name, and how we can assist. We'll call back shortly inshallah.'\n\nDAILY CONVERSATION:\nAbout a child's day: 'They really enjoyed [activity] — their confidence is growing.'\nRushed parent: 'No stress at all — we've got you. Take your time.'\nGuilty parent: 'You're doing amazing. They're safe and thriving here, alhamdulillah.'",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Behaviour, Safety & Incident Scripts",
        description:
          "How to communicate about behaviour, injuries, illness, and safety with families.",
        type: "document",
        content:
          "BEHAVIOUR SCRIPTS:\nPositive: 'Mashallah, [child] showed beautiful patience and manners today.'\nLow-level: 'Just a small note for today — nothing serious, alhamdulillah.'\nLarger conversation: 'Inshallah, with consistency from both sides, they'll settle.'\n\nINCIDENT / FIRST AID:\nMinor injury: 'All good, alhamdulillah — just a small bump. We gave first aid straight away.'\nHead knock: 'Just letting you know they had a small head knock. They are stable, alhamdulillah, but we always inform parents as a precaution.'\nUnwell child: 'They started feeling unwell so we kept them comfortable and monitored them.'\n\nLATE PICK-UP:\n'No worries, we kept [child] settled and safe.'\nNo notice: 'We hope everything is okay. Just a gentle reminder to call next time inshallah.'\n\nSAFETY:\nAuthorised pick-up: 'For safety, we can only release children to authorised contacts — thank you for understanding.'",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Difficult Conversations & Brand Phrases",
        description:
          "Scripts for upset parents, miscommunications, complaints, and the Amana brand hospitality phrases.",
        type: "document",
        content:
          "DIFFICULT MOMENTS:\nUpset parent: 'We hear you, and we're here to help inshallah.'\nMiscommunication: 'Thank you for your patience — let's clear it up together.'\nBoundary push: 'We completely understand your concern. For safety, our policy requires us to follow [procedure].'\n\nSCHOOL STAFF:\nDaily: 'Assalamu alaikum, hope your day is going smoothly.'\nFacilities: 'Please let us know if there are any areas unavailable — we'll adjust.'\nIssues: 'We noticed [issue] and wanted to share it early to work together.'\n\nBRAND PHRASES:\n'Your child is an amanah (a trust) with us — we uphold that deeply.'\n'We aim to make every child feel seen and valued.'\n'Have a peaceful evening inshallah.'\n\nTEAM-TO-FAMILY CONFIDENCE:\n'You can always rely on us.'\n'Your child's wellbeing is our priority.'\n'We're here to make your life easier.'\n'We're grateful to serve your family.'",
        duration: 10,
        isRequired: true,
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 13. AUDITS & COMPLIANCE DOCUMENTATION
  // ──────────────────────────────────────────────
  {
    title: "Audits & Compliance Documentation",
    description:
      "How to complete audits on OWNA, upload documents to SharePoint, and maintain compliance documentation for regulatory visits.",
    category: "Compliance",
    isRequired: false,
    status: "published",
    modules: [
      {
        title: "Completing Audits on OWNA",
        description:
          "Step-by-step guide to accessing, completing, and downloading audits from OWNA.",
        type: "checklist",
        content:
          "COMPLETING AN AUDIT:\n\n☐ Log into OWNA\n☐ From horizontal menu, select 'Service' then 'Calendar'\n☐ Select the audit you would like to review from the calendar\n☐ Copy the link in the description box\n☐ Paste link into a new browser tab\n☐ Complete all audit fields thoroughly\n☐ Select title at top left — add centre name and date\n☐ Download: File > Download > PDF Document\n\nUPLOADING TO SHAREPOINT:\n☐ Log into SharePoint\n☐ Navigate: Documents > Operations > Audits > Your Service\n☐ Select 'Create or Upload' > 'File Upload'\n☐ Choose completed audit file and select Open\n☐ Open document to confirm correct audit uploaded",
        duration: 10,
        isRequired: true,
      },
      {
        title: "Budget Tool & Financial Compliance",
        description:
          "How to use the budget tool, track spending, and maintain financial compliance.",
        type: "document",
        content:
          "USING THE BUDGET TOOL:\n\n1. Log into OWNA — select 'Attendances' then 'Weekly Attendances'\n2. Access Budget Tool via SharePoint: Documents > Operations > Templates > Updated Budget Tool - Termly\n3. Create your own copy: File > Create a Copy > Download a Copy\n4. Cross-reference OWNA attendances and input to budget tool\n5. Consider casual bookings\n6. Track all spending against weekly budget\n7. Record Woolworths orders and external supplier amounts\n8. Upload supplier receipts to SharePoint: Documents > Operations > Supplier Receipts > Your Service\n9. Once termly budget is complete, email to Operations@amanaoshc.com.au",
        duration: 10,
        isRequired: true,
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 14. COORDINATOR LEADERSHIP TRAINING
  // ──────────────────────────────────────────────
  {
    title: "Coordinator Leadership & Service Management",
    description:
      "Advanced training for Coordinators and 2ICs covering leadership principles, rostering, educational leadership, quality improvement, and the 'Above the Line' leadership model.",
    category: "Leadership",
    isRequired: false,
    status: "published",
    modules: [
      {
        title: "Above the Line Leadership",
        description:
          "The Above/Below the Line leadership model — recognising your state and leading with intention.",
        type: "document",
        content:
          "ABOVE THE LINE / BELOW THE LINE MODEL:\n\nABOVE THE LINE = Open, curious, focused on learning\n- Taking responsibility\n- Seeking feedback\n- Being curious about challenges\n- Focused on solutions and growth\n\nBELOW THE LINE = Closed, defensive, focused on being right\n- Blaming others\n- Avoiding feedback\n- Defending position\n- Focused on protecting ego\n\nKEY INSIGHT: Neither is inherently wrong, but recognising your state and shifting when needed helps you:\n- Show up intentionally\n- Manage reactions under pressure\n- Build trust with your team\n- Model reflective, resilient behaviour\n\nAs a Coordinator, your mindset sets the tone for the entire service.",
        duration: 15,
        isRequired: true,
      },
      {
        title: "Rostering & Staff Management",
        description:
          "How to build rosters in OWNA, manage staggered shifts, and maintain ratios.",
        type: "document",
        content:
          "ROSTERING IN OWNA:\n\n1. Log into OWNA > Staff > Roster\n2. To create staggering shifts: Settings > Enter shift start/finish > Add Shift Time\n3. Build Roster > Select staff for relevant room and shift\n4. Duplicate completed roster for following weeks\n5. Monitor ratio guide — ensure within 1:13 ratio\n6. For additional staff, contact State Manager for approval\n\nHover over shift icons to remove, edit, add or view staff shifts\n\nIMPORTANT: Ratios must be maintained at all times. Stagger shifts to ensure coverage during peak arrival/departure times.",
        duration: 15,
        isRequired: true,
      },
      {
        title: "Educational Leadership & Programming",
        description:
          "Your role as Educational Leader: programming, observations, reflections, and driving quality improvement.",
        type: "document",
        content:
          "AS EDUCATIONAL LEADER YOU ARE RESPONSIBLE FOR:\n\n- Guiding the educational program aligned with MTOP\n- Supporting educators in writing meaningful observations and reflections\n- Ensuring program reflects children's interests, voices, and family input\n- Reviewing documentation quality and providing feedback\n- Leading the planning cycle: observe > plan > implement > reflect\n- Displaying weekly/termly programs visibly for families\n- Driving continuous improvement through SAT/QIP\n\nQUALITY IMPROVEMENT:\n- Review NQS rating history and current self-assessment\n- Understand regulatory notification requirements\n- Set up compliance tracking (WWCC expiry, First Aid, ratios)\n- Use reflective practice to identify areas for improvement",
        duration: 20,
        isRequired: true,
      },
      {
        title: "Parent Communication & Enrolment",
        description:
          "Managing family relationships, handling enrolment queries, and the CCS system.",
        type: "document",
        content:
          "ENROLMENT & CCS:\n\nNew parent enquiry: 'Welcome! We're honoured you're considering Amana OSHC.'\nEncouraging enrolment: 'We'd love to welcome your family into the Amana community.'\nCCS questions: 'CCS can feel confusing — we're here to walk you through it. Call 1300 200 262.'\n\nCOORDINATOR RESPONSIBILITIES:\n- Send introduction letter/email to families\n- Schedule family meet-and-greet sessions\n- Manage enrolment forms and medical documentation\n- Ensure families understand CCS entitlements\n- Maintain open communication channels\n- Handle complaints professionally and document them",
        duration: 15,
        isRequired: true,
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 15. NATIONAL QUALITY STANDARD (NQS)
  // ──────────────────────────────────────────────
  {
    title: "National Quality Standard (NQS) for OSHC",
    description:
      "Understand the 7 Quality Areas of the NQS and how they apply to OSHC practice. Essential knowledge for regulatory visits and quality improvement.",
    category: "Education",
    isRequired: false,
    status: "published",
    modules: [
      {
        title: "The 7 Quality Areas",
        description:
          "Overview of all 7 NQS Quality Areas and what they mean for OSHC educators.",
        type: "document",
        content:
          "THE 7 NQS QUALITY AREAS:\n\nQA1: Educational Program and Practice\n- Programs are stimulating, engaging and enhance children's learning\n- Educators facilitate and extend children's play and learning\n\nQA2: Children's Health and Safety\n- Each child's health and physical activity is supported and promoted\n- Each child is protected (supervision, food safety, incident management)\n\nQA3: Physical Environment\n- Safe, suitable design and maintenance\n- Sustainable practices and environmental responsibility\n\nQA4: Staffing Arrangements\n- Staffing arrangements enhance children's learning\n- Educators are qualified, skilled, and supported\n\nQA5: Relationships with Children\n- Respectful and equitable relationships\n- Each child is supported to build relationships\n\nQA6: Collaborative Partnerships\n- Supportive relationships with families\n- Collaborative partnerships with communities\n\nQA7: Governance and Leadership\n- Effective leadership and governance\n- Continuous improvement and regulatory compliance",
        duration: 20,
        isRequired: true,
      },
      {
        title: "Preparing for Assessment & Rating",
        description:
          "How to prepare for an NQS assessment visit and what authorised officers look for.",
        type: "document",
        content:
          "PREPARING FOR ASSESSMENT:\n\n1. Review your service's Self-Assessment Tool (SAT)\n2. Understand your current NQS rating\n3. Review the Quality Improvement Plan (QIP)\n4. Ensure all documentation is current and accessible\n5. Practice articulating your philosophy and approach\n\nWHAT AUTHORISED OFFICERS LOOK FOR:\n- Evidence of practice, not just policies on paper\n- Children's agency and voice in the program\n- Meaningful family partnerships\n- Educator knowledge of children's learning\n- Clean, safe, stimulating environments\n- Compliance with ratios and qualifications\n- Knowledge of child protection and mandatory reporting\n\nKEY TIP: Officers will ask educators directly about their practices, children's learning, and how they link activities to outcomes. Know MTOP and be able to discuss specific children's development.",
        duration: 15,
        isRequired: true,
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 16. INCLUSIVE PRACTICES & CULTURAL SAFETY
  // ──────────────────────────────────────────────
  {
    title: "Inclusive Practices & Cultural Safety",
    description:
      "Creating inclusive environments for children of all abilities, cultures, and backgrounds. Includes Aboriginal and Torres Strait Islander perspectives, cultural safety, and supporting children with additional needs.",
    category: "Education",
    isRequired: false,
    status: "published",
    modules: [
      {
        title: "Acknowledgement of Country & First Nations Perspectives",
        description:
          "How to deliver Acknowledgement of Country and embed Aboriginal and Torres Strait Islander perspectives into daily practice.",
        type: "document",
        content:
          "ACKNOWLEDGEMENT OF COUNTRY:\n\n'Our meeting is being held on the lands of various Traditional Owner's people and I wish to acknowledge them as Traditional Owners. I would also like to pay my respects to their Elders, past and present, and Aboriginal Elders of other communities who may be here today.'\n\nEMBEDDING FIRST NATIONS PERSPECTIVES:\n- Include Aboriginal and Torres Strait Islander stories, art, and music in programming\n- Use local language words where appropriate\n- Celebrate NAIDOC Week, Reconciliation Week, and other significant dates\n- Connect with local Aboriginal community organisations\n- Display Aboriginal and Torres Strait Islander artwork and flags\n- Encourage children to learn about and respect First Nations cultures\n\nThis is an NQS requirement and a core part of the Amana OSHC Philosophy.",
        duration: 15,
        isRequired: true,
      },
      {
        title: "Supporting Children with Additional Needs",
        description:
          "Strategies for supporting children with disabilities, developmental differences, and diverse learning needs.",
        type: "document",
        content:
          "INCLUSIVE PRACTICE PRINCIPLES:\n\n- Every child is valued and respected regardless of ability\n- Adapt activities and environments to support participation\n- Collaborate with families and allied health professionals\n- Develop individual support plans where needed\n- Use visual aids, sensory tools, and flexible routines\n- Ensure physical accessibility of all spaces\n- Train staff in specific needs (ASD, ADHD, physical disability)\n- Celebrate diversity and teach children about inclusion\n\nKEY STRATEGIES:\n- Quiet/calm-down spaces for sensory regulation\n- Visual schedules and social stories\n- Simplified instructions with visual supports\n- Peer buddy systems\n- Flexible expectations based on individual capabilities",
        duration: 15,
        isRequired: true,
      },
      {
        title: "Cultural Safety & Diversity",
        description:
          "Creating culturally safe environments that celebrate diversity and support all families.",
        type: "document",
        content:
          "CULTURAL SAFETY AT AMANA OSHC:\n\n- Embrace the principles of equity and inclusion\n- Reflect and celebrate the rich diversity of our community\n- Foster belonging for all children, families, and educators\n- Programs designed to be culturally responsive\n- Use inclusive language at all times\n\nPRACTICAL STEPS:\n- Learn about the cultural backgrounds of families in your service\n- Celebrate cultural events and festivals throughout the year\n- Provide culturally diverse resources, books, and materials\n- Offer food options that respect dietary and cultural requirements\n- Support multilingual children and families\n- Display welcome signs in multiple languages\n- Never make assumptions based on appearance or name",
        duration: 10,
        isRequired: true,
      },
    ],
  },

  // ──────────────────────────────────────────────
  // 17. HOLIDAY PROGRAM OPERATIONS
  // ──────────────────────────────────────────────
  {
    title: "Holiday Program & Excursion Management",
    description:
      "Planning and running holiday programs, managing excursions (low-risk and high-risk), pupil-free days, and risk assessments for off-site activities.",
    category: "Operations",
    isRequired: false,
    status: "published",
    modules: [
      {
        title: "Holiday Program Planning",
        description:
          "How to plan engaging, themed holiday programs that balance excursions, incursions, and in-house activities.",
        type: "document",
        content:
          "AMANA OSHC HOLIDAY PROGRAMS:\n\n- Full day of care during school holidays\n- Mix of: Excursion Days, Incursion Days, In-House Days\n- Themed, play-based learning experiences\n\nPLANNING REQUIREMENTS:\n- Programs planned at least 2 weeks in advance\n- Risk assessments completed for all excursions\n- Parent permission forms distributed and returned\n- Staffing ratios confirmed for each activity type\n- Budget approved by management\n- Menus planned and food ordered\n- Transport arrangements confirmed\n- Emergency procedures adapted for off-site locations\n\nTHEME IDEAS:\n- Science & Discovery Week, Sports Carnival, Creative Arts, Cultural Celebrations, Nature & Environment, STEM Challenge Week, Masterchef Junior",
        duration: 15,
        isRequired: true,
      },
      {
        title: "Excursion Safety & Risk Assessment",
        description:
          "Risk assessment procedures, parent consent, transport safety, and ratio requirements for excursions.",
        type: "document",
        content:
          "EXCURSION TYPES & RATIOS:\n- Low risk excursions: 1:11 (park visits, library, walking distance)\n- High risk excursions: 1:8 (adventure parks, large venues)\n- Water-based excursions: 1:5 (pools, beaches)\n\nRISK ASSESSMENT CHECKLIST:\n- Venue suitability and hazard identification\n- Transport safety and seatbelt requirements\n- Supervision zones at the venue\n- Emergency procedures specific to location\n- First aid kit and medication for attending children\n- Communication plan (phones, emergency contacts)\n- Headcount procedures during transit and at venue\n- Shade, water, and sun protection arrangements\n\nPARENT CONSENT:\n- Written permission required for every excursion\n- Include destination, date, time, transport method\n- Must be returned BEFORE the excursion day",
        duration: 15,
        isRequired: true,
      },
    ],
  },
];

export const POST = withApiAuth(async (req, session) => {
  try {
    const existingTitles = new Set(
      (
        await prisma.lMSCourse.findMany({
          where: { deleted: false },
          select: { title: true },
        })
      ).map((c) => c.title)
    );

    let created = 0;
    const createdTitles: string[] = [];

    for (const course of ALL_COURSES) {
      if (existingTitles.has(course.title)) continue;

      await prisma.lMSCourse.create({
        data: {
          title: course.title,
          description: course.description,
          category: course.category,
          isRequired: course.isRequired,
          status: course.status,
          sortOrder: created,
          modules: {
            create: course.modules.map((m, i) => ({
              title: m.title,
              description: m.description ?? "",
              type: m.type,
              content: m.content ?? "",
              resourceUrl: m.resourceUrl,
              duration: m.duration,
              sortOrder: i,
              isRequired: m.isRequired,
            })),
          },
        },
      });

      created++;
      createdTitles.push(course.title);
    }

    return NextResponse.json({
      message: `Seeded ${created} LMS course(s) with modules. ${existingTitles.size} already existed.`,
      created: createdTitles,
      total: ALL_COURSES.length,
    });
  } catch (err) {
    logger.error("LMS seed error", { err });
    return NextResponse.json(
      { error: "Failed to seed LMS courses" },
      { status: 500 }
    );
  }
}, { roles: ["owner"] });
