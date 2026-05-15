"use client";

import { useState, useCallback } from "react";

// ─── COLOURS (matching Amana Way panel) ──────────────────────────────────────
const C = {
  gold:         "#F5A623",
  goldHover:    "#E09515",
  goldLight:    "#FFF6E0",
  teal:         "#1A4F5C",
  tealLight:    "#2A6B7C",
  tealDark:     "#0F3340",
  tealPale:     "rgba(26,79,92,0.07)",
  cream:        "#FDFAF5",
  creamDark:    "#F2EDE3",
  border:       "rgba(26,79,92,0.12)",
  borderStrong: "rgba(26,79,92,0.25)",
  textPrimary:  "#1A1A1A",
  textMid:      "#4A5568",
  textMuted:    "#7A8A9A",
  green:        "#2E7D32",
  greenLight:   "#E8F5E9",
  red:          "#C62828",
  redLight:     "#FFEBEE",
  amber:        "#E65100",
  amberLight:   "#FFF3E0",
  white:        "#FFFFFF",
};

// ─── HANDBOOK DATA ────────────────────────────────────────────────────────────
const SECTIONS = [
  {
    id: "welcome",
    label: "Welcome",
    icon: "✦",
    color: C.teal,
    subsections: [
      {
        title: "Mission & Vision",
        content: [
          { type: "callout", variant: "gold", label: "Vision", text: "The world's most inspiring afterschool experience — where every child unlocks hidden strengths, nurtures their spirit, and grows into who they were meant to be." },
          { type: "callout", variant: "teal", label: "Mission", text: "To deliver World-Class and safe after school care rooted in compassion, creativity and character-building — so every child leaves feeling stronger, brighter and more whole." },
        ],
      },
      {
        title: "IHSAN Values",
        content: [
          { type: "table", headers: ["Initial", "Value", "Observable Behaviours"], rows: [
            ["I", "Integrity", "Honour commitments, transparent fees, accurate incident reporting."],
            ["H", "Hospitality", "Warm greetings to every parent; child centred spaces; inclusive language."],
            ["S", "Service", "Go the extra step — offer homework help, share developmental feedback."],
            ["A", "Aspiration", "Continuous improvement, professional development, innovation mindset."],
            ["N", "Nurture", "Safe ratios, proactive behaviour guidance, emotional coaching."],
          ]},
        ],
      },
      {
        title: "Amana OSHC Philosophy",
        content: [
          { type: "pillars", items: [
            { icon: "👧", title: "Children Are Capable And Confident Learners", text: "We view each child as a competent and successful learner filled with curiosity and unique strengths." },
            { icon: "🤝", title: "Equity, Inclusion And Diversity Are Fundamental", text: "We embrace the principles of equity and inclusion, ensuring every child feels valued and respected." },
            { icon: "🌏", title: "Australia's Aboriginal And Torres Strait Islander Cultures Are Honoured", text: "We deeply value Australia's first nations cultures and embed these perspectives into our daily culture." },
            { icon: "👨‍👩‍👧", title: "Families Are Key Partners In Their Child's Development", text: "We foster strong relationships with families, inviting their collaboration and involvement." },
            { icon: "✅", title: "Best Practice In Education And Care", text: "Our educators provide high-quality care that reflects best practices and promotes learning through play." },
          ]},
        ],
      },
      {
        title: "Amana OSHC Principles (FEP)",
        content: [
          { type: "trio", items: [
            { icon: "🎉", title: "Fun", text: "Every child, family, educator or member of the school community should walk into the service and have fun." },
            { icon: "💡", title: "Engaging", text: "Do children and families want to be at the service?" },
            { icon: "🌟", title: "Presentation", text: "What do families see and feel when they enter a service or interact with Amana OSHC?" },
          ]},
        ],
      },
    ],
  },
  {
    id: "roles",
    label: "Roles",
    icon: "◈",
    color: "#2E7D32",
    subsections: [
      {
        title: "Organisational Structure",
        content: [
          { type: "roles", items: [
            { role: "Area Manager", color: C.teal, responsibilities: ["Manage current regions", "Ensures safety & compliance is met", "All reports to be made to OSHC Director"] },
            { role: "Coordinator / Centre Director", color: "#2E7D32", responsibilities: ["Experience in child-care or OSHC", "Educational Leader of the program", "Manages day-to-day centre operations"] },
            { role: "2IC Educator", color: "#5C6BC0", responsibilities: ["Second in Charge in larger services", "Supports Coordinator with administration", "Working towards becoming a Coordinator"] },
            { role: "Educator", color: C.gold, responsibilities: ["Make up largest part of the team", "Priority is engaging with the children", "Helps to run the program"] },
          ]},
        ],
      },
      {
        title: "Role of an Amana OSHC Educator",
        content: [
          { type: "section-header", text: "Purpose" },
          { type: "list", items: [
            "Support children's wellbeing, learning and development through high-quality, play-based programs.",
            "Work collaboratively under the direction of the OSHC Coordinator/Educational Leader to deliver safe, inclusive and engaging care.",
          ]},
          { type: "section-header", text: "Core Responsibilities" },
          { type: "list", numbered: true, items: [
            "Build positive, respectful relationships with children, families, and colleagues.",
            "Implement the My Time Our Place (MTOP) framework in daily practice.",
            "Assist with planning, delivering and evaluating educational and leisure experiences.",
            "Uphold child-safe standards and mandatory reporting requirements.",
            "Maintain confidentiality, professionalism and compliance with all Amana OSHC policies, the National Law & Regulations, NQS & WHS Acts.",
          ]},
          { type: "section-header", text: "Key Focus Areas" },
          { type: "focus-areas", items: [
            { num: "1", title: "Educational Program & Practice", text: "Create inspiring play-based environments that extend children's learning, document progress, and reflect on outcomes." },
            { num: "2", title: "Children's Health & Safety", text: "Ensure constant supervision, safe ratios, first-aid readiness, hygiene, and adherence to food-safety and child-protection procedures." },
            { num: "3", title: "Physical Environment", text: "Maintain safe, stimulating and sustainable indoor/outdoor areas; report hazards and equipment issues promptly." },
            { num: "4", title: "Professional Conduct & Teamwork", text: "Model ethical behaviour, follow the ECA Code of Ethics, participate in meetings, and contribute to continuous improvement (SAT/QIP)." },
            { num: "5", title: "Relationships & Community", text: "Promote inclusion, cultural safety and partnerships with families and local communities to strengthen children's sense of belonging." },
          ]},
          { type: "section-header", text: "Key Qualities" },
          { type: "tags", items: ["Nurturing", "Observant", "Culturally Aware", "Proactive", "Reflective"] },
        ],
      },
      {
        title: "Our Club Names",
        content: [
          { type: "clubs", items: [
            { name: "Rise & Shine Club", emoji: "🌅", img: "/amana-assets/club-rise-shine.svg", desc: "Start the day with breakfast, quiet spaces, and light activities." },
            { name: "Iqra Circle", emoji: "📖", img: "/amana-assets/club-iqra.svg", desc: "Nurture learning Qur'an, Tajweed, reflection, and living by Islamic values." },
            { name: "Little Champions Club", emoji: "⚽", img: "/amana-assets/club-little-champions.svg", desc: "Build strength and skills through sports and active play." },
            { name: "Fuel Up with Amana", emoji: "🍽️", img: "/amana-assets/club-fuel-up.svg", desc: "Enjoy wholesome meals and snacks inspired by the Sunnah." },
            { name: "Amana Afternoons", emoji: "☀️", img: "/amana-assets/club-afternoons.svg", desc: "After-school meals, activities, and quiet reflection rooted in Islamic values." },
            { name: "Homework Heroes", emoji: "📚", img: "/amana-assets/club-homework.svg", desc: "Dedicated time to complete homework and get homework assistance." },
            { name: "Imagination Station", emoji: "🎨", img: "/amana-assets/club-imagination.svg", desc: "Engage in STEM projects, arts, and crafts. We nurture creativity and unique talents." },
            { name: "Holiday Quest", emoji: "🏕️", img: "/amana-assets/club-holiday-quest.svg", desc: "School holiday adventures with themed activities, projects, and excursions." },
          ]},
        ],
      },
    ],
  },
  {
    id: "operations",
    label: "Daily Ops",
    icon: "◉",
    color: "#5C6BC0",
    subsections: [
      {
        title: "What We Do",
        content: [
          { type: "services", items: [
            { title: "Before & After School Care", icon: "🏫", times: ["Before: 6:30 am – 9:00 am", "After: 3:00 pm – 6:30 pm"] },
            { title: "Holiday Programs", icon: "🌴", times: ["Full day of care", "Excursion Days, Incursion Days, In-House Days"] },
            { title: "Pupil Free Days", icon: "📅", times: ["Full day of care", "During the school term"] },
          ]},
        ],
      },
      {
        title: "Daily Routine (ASC)",
        content: [
          { type: "timeline", items: [
            { time: "2:30 PM", title: "Arrival & Preparation", color: C.teal, steps: ["Arrive on time and sign in on OWNA.", "Begin area setup and food preparation.", "Attend team briefing: daily menu, activities, supervision zones, child alerts.", "Complete Opening Checklist before children arrive."] },
            { time: "3:10 PM", title: "Child Collection & Safe Arrivals", color: "#2E7D32", steps: ["Set up pick-up point flag outside service.", "Collect children from classrooms or meeting points.", "Sign in each child immediately on OWNA iPad.", "Cross-check attendance; report discrepancies immediately."] },
            { time: "3:20 PM", title: "Group Connection", color: "#5C6BC0", steps: ["Gather children calmly.", "Deliver Acknowledgement of Country.", "Outline daily program and expectations.", "Log short meeting in OWNA."] },
            { time: "3:25 PM", title: "Program Commences", color: "#E65100", steps: ["Begin activities with clear supervision zones.", "Take photos (minimise faces — appropriate angles only).", "Upload daily post on OWNA linking to MTOP outcomes.", "Share approved content to WhatsApp groups."] },
            { time: "4:00 PM", title: "Snack / Meal Time", color: "#C62828", steps: ["Serve food following hygiene protocols and daily menu.", "Check allergies and dietary notes.", "Allow children to serve with thongs or gloves.", "Record food handling in OWNA checklists."] },
            { time: "4:00–6:00 PM", title: "Ongoing Program & Family Interaction", color: C.tealLight, steps: ["Maintain active supervision across all play zones.", "Encourage children's suggestion book.", "Greet parents warmly and assist with sign-out.", "At 5:00 PM: complete daily reflection and update notes."] },
            { time: "6:00 PM", title: "Close & Pack-Down", color: C.tealDark, steps: ["Begin closing checklist: clean, sanitise, store resources.", "Confirm all children signed out.", "Lock up and sign out staff attendance.", "Debrief with Coordinator if required.", "Send photo of cleaned service area to group chat."] },
          ]},
        ],
      },
      {
        title: "OWNA — Key Navigation",
        content: [
          { type: "owna-guide", items: [
            { action: "Staff Sign-In", path: "Centre Check-In/Out → Enter PIN → OK" },
            { action: "Room Check-In", path: "Room Check-In → Select Room → Enter PIN → OK" },
            { action: "Child Sign-In/Out", path: "Actions → Attendances → Tap child name → Click OK" },
            { action: "Opening Checklist", path: "Checklists tab → Opening Checklist" },
            { action: "Closing Checklist", path: "Daily Checklists → Closing Checklist" },
            { action: "Daily Post", path: "Press middle + button → Create Post → Fill out → Tag children → Change EYLF to MTOP → Attach program → Add photos → Post" },
            { action: "Daily Reflection", path: "Staff Reflections tab → Click + → Fill in → Ensure not draft → Post" },
            { action: "Incident Report", path: "Centre/Ratio Menu → Child's Profile → ellipsis → Create Incident Report → Complete all fields → Collect signatures → Publish" },
            { action: "Team Meeting Notes", path: "Staff Meetings & Minutes tab → Press + → Fill out during meeting" },
            { action: "Food Safety", path: "Daily Menu Plan & Food Safety Checklist" },
          ]},
        ],
      },
    ],
  },
  {
    id: "compliance",
    label: "Compliance",
    icon: "◆",
    color: "#C62828",
    subsections: [
      {
        title: "Educator Compliance Requirements",
        content: [
          { type: "callout", variant: "teal", label: "Platform", text: "All compliance documents are maintained through the OWNA portal. Contact hr@amanaoshc.com.au with any questions." },
          { type: "section-header", text: "Mandatory Documents" },
          { type: "list", items: [
            "Working with Children Check (Employee)",
            "Copy of completed Qualification OR evidence of enrolment (dated within last 3 months)",
            "HLTAID012 — First Aid in an Educational Care Setting",
            "Child Protection Training (completed through RTO)",
          ]},
        ],
      },
      {
        title: "Essential Training",
        content: [
          { type: "training", items: [
            { code: "CHCPRT025", title: "Identify and Report Children and Young People at Risk", price: "$119", delivery: "Online / Self-paced", who: "All educators", covered: true },
            { code: "HLTAID009", title: "CPR — Provide Cardiopulmonary Resuscitation", price: "$45", delivery: "In-person (renew annually)", who: "All educators", covered: true },
            { code: "HLTAID012", title: "First Aid in an Education & Care Setting", price: "$115", delivery: "In-person (renew every 3 years)", who: "All educators", covered: true },
            { code: "SITXFSA005", title: "Use Hygienic Practices for Food Safety", price: "$35", delivery: "Online", who: "All educators", covered: true },
            { code: "SITXFSA006", title: "Participate in Safe Food Handling Practice (Supervisor)", price: "$99", delivery: "Online", who: "2IC & above", covered: true },
            { code: "SITSS00069", title: "Food Safety Supervisor (FSS) Bundle", price: "$119", delivery: "Online", who: "2IC & above (includes 005 & 006)", covered: true },
          ]},
          { type: "callout", variant: "green", label: "Amana Subsidy", text: "Amana OSHC covers 50% of the cost for all listed courses. Contact hr@amanaoshc.com.au for details." },
        ],
      },
      {
        title: "Supervision & Ratios",
        content: [
          { type: "section-header", text: "CLEAR Supervision Framework" },
          { type: "clear", items: [
            { letter: "C", word: "Count", desc: "Headcounts every 30 minutes." },
            { letter: "L", word: "Line of Sight", desc: "Ensure you have an unobstructed view of all children at all times." },
            { letter: "E", word: "Engage", desc: "Actively listen to and participate with children." },
            { letter: "A", word: "Awareness", desc: "Constantly scan the environment for risks." },
            { letter: "R", word: "Response", desc: "Be ready to act immediately in any situation." },
          ]},
          { type: "section-header", text: "Required Ratios" },
          { type: "ratios", items: [
            { label: "Standard regulation", ratio: "1 : 15" },
            { label: "Low risk excursions", ratio: "1 : 11" },
            { label: "High risk excursions", ratio: "1 : 8" },
            { label: "Water-based excursions", ratio: "1 : 5" },
            { label: "Specialist schools", ratio: "1 : 2" },
          ]},
          { type: "callout", variant: "amber", label: "Reminder", text: "High risk areas and activities must be supervised by highly experienced Educators. Always ask to see the supervision plan when attending your first shift at a new service." },
        ],
      },
      {
        title: "MTOP Framework — 5 Learning Outcomes",
        content: [
          { type: "mtop", items: [
            { num: "01", title: "The child has a sense of identity", points: ["Children feel safe, secure and supported", "Children develop their autonomy, inter-dependence, resilience and sense of agency", "Children develop knowledgeable and confident self identities"] },
            { num: "02", title: "Children are connected with and contribute to their world", points: ["Children develop a sense of belonging to groups and communities", "Children respond to diversity with respect", "Children become socially responsible and show respect for the environment"] },
            { num: "03", title: "Children have a strong sense of wellbeing", points: ["Children become strong in their social and emotional wellbeing", "Children take increasing responsibility for their own health and physical wellbeing"] },
            { num: "04", title: "Children are confident and involved learners", points: ["Children develop curiosity, cooperation, confidence, creativity", "Children use problem solving, inquiry, experimentation, hypothesising", "Children transfer and adapt what they have learned"] },
            { num: "05", title: "Children are effective communicators", points: ["Children interact verbally and non-verbally for a range of purposes", "Children engage with a range of texts", "Children collaborate with others, express ideas using a range of media"] },
          ]},
        ],
      },
    ],
  },
  {
    id: "safety",
    label: "Child Safety",
    icon: "◉",
    color: "#E65100",
    subsections: [
      {
        title: "Child Safe Standards",
        content: [
          { type: "callout", variant: "red", label: "Priority", text: "Every Amana OSHC employee has a responsibility to protect the health, safety, welfare and wellbeing of children. Children and educators have the right to feel safe, secure and nurtured in an environment free of physical, sexual, psychological, emotional abuse including neglect." },
          { type: "standards", items: [
            { num: "1", title: "Organisational Culture", text: "Strategies to embed an organisational culture of child safety, including through effective leadership arrangements." },
            { num: "2", title: "Child Safe Policy", text: "A child safe policy or statement of commitment to child safety." },
            { num: "3", title: "Code of Conduct", text: "A code of conduct that establishes clear expectations for appropriate behaviour with children." },
            { num: "4", title: "HR Practices", text: "Screening, supervision, training and other human resource practices that reduce the risk of child abuse by new and existing personnel." },
            { num: "5", title: "Reporting Processes", text: "Processes for responding to and reporting suspected child abuse." },
            { num: "6", title: "Risk Identification", text: "Strategies to identify and reduce or remove the risk of child abuse." },
            { num: "7", title: "Child Empowerment", text: "Strategies to promote the participation and empowerment of children." },
          ]},
        ],
      },
      {
        title: "Recognising Abuse & Neglect",
        content: [
          { type: "abuse-types", items: [
            {
              type: "Physical Abuse",
              color: C.red,
              definition: "Occurs when a child suffers or is likely to suffer physical harm from a non-accidental injury inflicted by another person.",
              behavioural: ["Unusual fear of physical contact with adults", "Aggressive behaviour or disproportionate reactions", "Wearing clothes unsuitable for weather to hide injuries", "Habitual absences from school without explanation"],
              physical: ["Bruises or welts on facial areas and body", "Burns showing shape of object used (iron, cigarette)", "Fractures not consistent with explanation", "Multiple injuries, old and new"],
            },
            {
              type: "Sexual Abuse",
              color: "#7B1FA2",
              definition: "Occurs when a person involves a child in sexual acts, or deliberately puts a child in the presence of sexual behaviour inappropriate for the child's age and development.",
              behavioural: ["Disclosure directly or indirectly", "Persistent and age-inappropriate sexual activity", "Fear of home, specific places or particular adults", "Regressive behaviour such as bed-wetting or speech loss"],
              physical: ["Injury to genital or rectal area", "Injury to breasts, buttocks or upper thighs", "Sexually-transmitted diseases", "Pregnancy, especially in very young adolescents"],
            },
            {
              type: "Emotional Abuse",
              color: "#E65100",
              definition: "Occurs when a child is repeatedly rejected, isolated or frightened by threats, or by witnessing family violence. Includes hostility, derogatory name-calling and persistent coldness.",
              behavioural: ["Poor self-image and low self-esteem", "Unexplained mood swings, depression, self-harm", "Behaviours not age-appropriate", "Lack of positive social contact with other children"],
              physical: ["Language delay, stuttering or selectively being mute", "Delays in emotional, mental or physical development"],
            },
            {
              type: "Neglect",
              color: "#5D4037",
              definition: "A continual failure to provide a child with necessities of life — clothing, food, hygiene, medical attention, shelter and supervision.",
              behavioural: ["Gorging when food is available or inability to eat", "Begging for, or stealing food", "Little positive interaction with parent/carer", "Self-destructive behaviour"],
              physical: ["Appearing consistently dirty and unwashed", "Consistently inappropriately dressed for weather", "Being consistently hungry, tired and listless", "Having inadequate shelter and unsafe conditions"],
            },
          ]},
        ],
      },
      {
        title: "Mandatory Reporting Obligations",
        content: [
          { type: "callout", variant: "red", label: "Legal Requirement", text: "Failure to report carries heavy fines, civil suit and jail time. If you have a reasonable belief a child is at risk, a report to the Child Protection Helpline is required and cannot be withheld." },
          { type: "section-header", text: "Educator Responsibilities" },
          { type: "list", items: [
            "Recognise and respond appropriately to vulnerabilities, risks and needs of children and young people.",
            "Report any suspicion of child abuse to the Centre Director immediately — do not investigate yourself.",
            "Never disclose to a parent/carer that a report has been made if doing so could place a child at further risk.",
            "Document all observations, disclosures and actions factually and promptly in the incident log.",
            "Actively seek feedback from an authorised agency after making a child protection report.",
          ]},
          { type: "contacts", items: [
            { state: "NSW", org: "Child Protection Hotline", phone: "132 111" },
            { state: "VIC", org: "Child First", phone: "(03) 9329 4822" },
            { state: "WA", org: "Central Intake Team", phone: "1800 273 889" },
          ]},
        ],
      },
      {
        title: "Late / Non-Arrival of Children",
        content: [
          { type: "timeline", items: [
            { time: "3:15 PM", title: "Check safe arrival", color: C.teal, steps: ["Safe arrival time to the program once the bell has gone.", "Verify all booked children are present."] },
            { time: "3:25 PM", title: "Make contact", color: "#E65100", steps: ["Make a PA announcement and/or contact the school office.", "Call and text parent to confirm child is attending or has been collected."] },
            { time: "3:30 PM", title: "Escalate", color: C.red, steps: ["Continue to contact parent and emergency contacts.", "Contact Area Manager immediately."] },
            { time: "3:40 PM", title: "Emergency services", color: "#7B1FA2", steps: ["CALL Emergency 000 if child cannot be located."] },
          ]},
          { type: "callout", variant: "amber", label: "Authorisation to Collect", text: "Only release a child to persons listed on the enrolment form. Emergency contacts must produce photo ID and be over 18. Take a photocopy of the ID. Never release a child to an unauthorised person, regardless of verbal instruction. If a parent/carer appears impaired, do not release the child — contact the Centre Director immediately." },
        ],
      },
      {
        title: "Medical Conditions & Medication",
        content: [
          { type: "section-header", text: "Administration of Medication" },
          { type: "list", items: [
            "Parents/guardians must sign the medication authorisation form before any medication is administered.",
            "Children are NOT to self-medicate while in attendance.",
            "Medication must be stored as recommended by the package and away from other children.",
            "Medication must NOT be kept in the child's school bag.",
            "All medication must be in original package/container, in-date, with child's full name and prescribed dosage.",
            "Two educators must be present when administering medication and BOTH must sign the form.",
            "Parent/guardian must acknowledge and sign upon collection.",
          ]},
          { type: "callout", variant: "red", label: "Expired Medications", text: "Contact the parent immediately when medication expires. A replacement must be provided before the child attends again. Expired medications MUST be returned to the parent for disposal. The Coordinator can refuse care where medical documentation and medication have not been provided." },
          { type: "section-header", text: "Reportable Incidents" },
          { type: "callout", variant: "amber", label: "Must Report", text: "Emergency services attending • Child seeks medical attention • Broken/fracture bones • Head injury requiring medical attention • Non-arrival/missing child • Child unaccounted for >5 minutes • Loss of a child • Child locked in/out of service • Child walks off premises • Asthma attack or Anaphylaxis requiring Epi-pen • Death of a child" },
          { type: "section-header", text: "Serious Incident Procedure" },
          { type: "list", numbered: true, items: [
            "Contact emergency services (000).",
            "Contact your Area Manager immediately.",
            "Contact parent/s immediately.",
            "Area Manager MUST complete a notification to ACECQA within 24 hours.",
            "Area Manager will inform school Principal.",
          ]},
        ],
      },
    ],
  },
  {
    id: "policies",
    label: "Policies",
    icon: "▣",
    color: "#5C6BC0",
    subsections: [
      {
        title: "Behaviour Guidance Policy",
        content: [
          { type: "policy-intro", text: "This policy guides how educators support children to develop self-regulation, manage conflict and build positive social skills — using encouragement and natural consequences rather than punishment." },
          { type: "list", items: [
            "Use positive language and redirection to guide behaviour; avoid shouting, threats or physical punishment.",
            "Model respectful behaviour and calm communication at all times.",
            "Involve children in setting fair group agreements and revisit them regularly.",
            "Document and report persistent or serious behaviour concerns to the Centre Director.",
            "NEVER use isolation, humiliation or food as a behaviour management tool.",
          ]},
        ],
      },
      {
        title: "Code of Conduct Policy",
        content: [
          { type: "policy-intro", text: "This policy outlines the professional standards and behaviours expected of all Amana staff — with children, families, colleagues and the broader community." },
          { type: "list", items: [
            "Treat all children, families and colleagues with respect, dignity and cultural sensitivity.",
            "Maintain professional boundaries — do not share your personal contact details with families or connect with them on personal social media.",
            "Dress in your Amana uniform and present professionally at all times.",
            "Do not discuss confidential information about children, families or colleagues outside of work.",
            "Report any breach of the Code of Conduct (by yourself or others) to the Centre Director.",
          ]},
        ],
      },
      {
        title: "Child Safe Environment Policy",
        content: [
          { type: "policy-intro", text: "This policy ensures all staff create and maintain an environment where children are physically and emotionally safe, and where their rights and voices are respected." },
          { type: "list", items: [
            "Actively supervise children at all times according to required ratios.",
            "Complete all required child safe training, including the Child Safe Standards modules.",
            "Report any unsafe physical environment (broken equipment, hazards) to the Centre Director.",
            "Foster a culture where children feel heard and are encouraged to speak up.",
            "NEVER be alone with a single child behind closed doors.",
          ]},
        ],
      },
      {
        title: "Privacy & Confidentiality Policy",
        content: [
          { type: "policy-intro", text: "This policy protects the personal and sensitive information of children, families and staff — and explains how we collect, store and use that information responsibly." },
          { type: "list", items: [
            "Never share a child's or family's personal information with unauthorised people, including other families.",
            "Do not photograph children without prior parental consent on file; never share images on personal devices or social media.",
            "Keep physical records secure and digital records password protected.",
            "If you become aware of a privacy breach, notify the Centre Director immediately.",
            "Access only the information you need to do your job; do not browse records out of personal curiosity.",
          ]},
        ],
      },
      {
        title: "Delivery & Collection of Children Policy",
        content: [
          { type: "policy-intro", text: "This policy ensures children are only released to authorised persons and that all arrivals and departures are accurately recorded." },
          { type: "list", items: [
            "Only release a child to a person listed as authorised on their enrolment record — check ID if unfamiliar.",
            "Record every arrival and departure in OWNA at the time it occurs; never backfill.",
            "If a child is not collected by close, follow the Late/Non-Collection procedure and notify the Centre Director.",
            "If a parent/carer appears impaired (e.g. intoxicated), do not release the child — contact the Centre Director immediately.",
            "Never allow an unauthorised person to take a child, regardless of any verbal instruction.",
          ]},
        ],
      },
      {
        title: "Safe Use of Digital Technologies Policy",
        content: [
          { type: "policy-intro", text: "This policy guides the safe, ethical and age-appropriate use of digital devices and online platforms by children in our care and by staff in the workplace." },
          { type: "list", items: [
            "Supervise children's use of devices and the internet at all times.",
            "Only use approved, age-appropriate digital resources and applications.",
            "Do not use your personal mobile phone for personal use while supervising children.",
            "Report any concerning online behaviour or content to the Centre Director immediately.",
            "Never allow children to access social media, chat platforms or unfiltered internet.",
          ]},
        ],
      },
      {
        title: "Emergency & Evacuation Policy",
        content: [
          { type: "policy-intro", text: "This policy describes how staff must respond to emergencies — including fire, lockdown, medical events and natural disasters — to keep children and staff safe." },
          { type: "list", items: [
            "Know the location of all emergency exits, assembly points and the Emergency Management Plan at your site.",
            "Respond immediately and calmly to any alarm or emergency — do not wait for instructions.",
            "Account for every child using the OWNA roll during any evacuation; never leave until headcount is confirmed.",
            "Call 000 for life-threatening emergencies and notify the Centre Director as soon as it is safe to do so.",
            "Participate in all required emergency drills and debriefs.",
          ]},
        ],
      },
      {
        title: "Sick Leave Policy",
        content: [
          { type: "policy-intro", text: "This policy outlines the entitlements and process for taking personal/sick leave — and reminds staff of their responsibility to keep unwell children and staff away from the service." },
          { type: "list", items: [
            "Notify your Centre Director as early as possible (before shift start) if you are unwell and cannot attend.",
            "Do not attend work if you have a contagious illness — you must be symptom-free for 24 hours before returning.",
            "Provide a medical certificate for absences of 3 or more consecutive days, or as requested.",
            "Advise families not to bring unwell children; follow exclusion period guidelines for communicable diseases.",
            "Record your leave accurately through the OWNA staff module.",
          ]},
        ],
      },
      {
        title: "Work Health & Safety (WHS) Policy",
        content: [
          { type: "policy-intro", text: "This policy reflects Amana's commitment to providing a safe and healthy workplace — and each educator's responsibility to actively participate in keeping it that way." },
          { type: "list", items: [
            "Report all hazards, near-misses and incidents to the Centre Director on the day they occur and record in OWNA.",
            "Follow all safe work procedures and use equipment as instructed.",
            "Do not lift more than is safely manageable; use correct manual handling techniques.",
            "Participate in WHS training, inductions and risk assessments.",
            "Raise any WHS concerns with the Centre Director or Health and Safety Representative — you will not face any negative consequence for doing so.",
          ]},
        ],
      },
    ],
  },
  {
    id: "hr",
    label: "HR & Payroll",
    icon: "◈",
    color: C.gold,
    subsections: [
      {
        title: "Staff Enquiries",
        content: [
          { type: "callout", variant: "gold", label: "All Staff Enquiries", text: "For all HR, payroll, compliance, and general staff enquiries — contact hr@amanaoshc.com.au" },
        ],
      },
      {
        title: "Your First Day",
        content: [
          { type: "section-header", text: "Before Your First Shift" },
          { type: "checklist", items: [
            "Read service specific guide book",
            "Know where the school is that your shift is at",
            "Know where the service is located within the school",
            "Research parking/public transport options",
            "Save the service phone number to your phone",
            "Log into OWNA and have PIN code ready to sign in on service iPad",
            "Email/print out your staff records to present to the service area manager",
            "Have your full uniform ready to go",
          ]},
        ],
      },
      {
        title: "Staff Uniform",
        content: [
          { type: "section-header", text: "Provided to New Team Members" },
          { type: "list", items: [
            "1 × T-Shirt",
            "1 × Zip-Up Jacket",
            "1 × Bucket Hat (must be worn in Terms 1 & 4)",
            "1 × Lanyard and ID tag",
          ]},
          { type: "section-header", text: "Acceptable Work Attire" },
          { type: "list", items: [
            "¾ or full length trousers or pants",
            "Leggings/Activewear must be of thick material that does not go see-through when stretched",
            "Skirts/shorts must come to knee length",
            "Closed toe shoes only — must be appropriate for actively engaging in high energy activities",
            "Full Amana OSHC uniform as provided",
          ]},
        ],
      },
      {
        title: "Rosters & Shift Cancellations",
        content: [
          { type: "callout", variant: "teal", label: "OWNA Rosters", text: "Rosters are published through OWNA approximately 1 week in advance. Download the app, check your information is correct, add unavailability, and ensure notifications are turned on." },
          { type: "section-header", text: "Cancellation Notice Requirements" },
          { type: "table", headers: ["Shift Type", "Notice Required By"], rows: [
            ["Before School Care (BSC)", "2:30 pm the day before the shift"],
            ["After School Care (ASC)", "10:00 am the day of the shift"],
            ["Holiday Program", "2:30 pm the day before the shift"],
          ]},
          { type: "callout", variant: "amber", label: "Who to Contact", text: "Educators & 2ICs: contact the Coordinator of the service your shift is rostered at." },
        ],
      },
      {
        title: "Payroll",
        content: [
          { type: "payroll-card", items: [
            { label: "Pay Cycle", value: "Fortnightly — processed on Wednesday" },
            { label: "Payslips", value: "Emailed to your personal email on pay day" },
            { label: "Payroll Queries", value: "hr@amanaoshc.com.au" },
          ]},
        ],
      },
    ],
  },
  {
    id: "acknowledgement",
    label: "Sign-Off",
    icon: "✎",
    color: "#2E7D32",
    subsections: [
      {
        title: "Educator Acknowledgement",
        content: [
          { type: "ack-intro", text: "At Amana OSHC, we believe that understanding our policies and procedures is essential to providing a safe, high-quality, and inclusive environment for all children. By completing this form, you acknowledge that you have read, understood, and agree to follow the policies and expectations outlined in this handbook." },
          { type: "policy-checklist", items: [
            "Behaviour Guidance Policy",
            "Child Protection Policy",
            "Child Safe Environment Policy",
            "Code of Conduct Policy",
            "Dealing with Complaints Policy",
            "Dealing with Complaints Policy (Staff)",
            "Delivery and Collection of Children Policy",
            "Educational Program Policy",
            "Emergency and Evacuation Policy",
            "Administration of First Aid Policy",
            "Privacy and Confidentiality Policy",
            "Safe Arrival of Children Policy",
            "Safe Use of Digital Technologies and Online Environments Policy",
            "Sick Leave (Sick Staff) Policy",
            "Work Health and Safety (WHS) Policy",
          ]},
          { type: "declarations", items: [
            "I understand that these policies are designed to keep children, families, and staff safe and supported at all times.",
            "I agree to uphold Amana OSHC's values of care, respect, and professionalism in all aspects of my role.",
            "I understand that failure to follow these policies may result in further review or disciplinary action.",
            "I commit to seeking clarification or additional training if I am unsure about any part of these policies.",
          ]},
          { type: "sign-off-form" },
        ],
      },
    ],
  },
];

// ─── COMPONENT RENDERERS ──────────────────────────────────────────────────────

function CalloutBlock({ variant, label, text }) {
  const styles = {
    gold:  { bg: C.goldLight, border: C.gold, labelColor: C.tealDark },
    teal:  { bg: C.tealPale,  border: C.teal, labelColor: C.teal },
    green: { bg: C.greenLight, border: C.green, labelColor: C.green },
    red:   { bg: C.redLight,  border: C.red,  labelColor: C.red },
    amber: { bg: C.amberLight, border: C.amber, labelColor: C.amber },
  };
  const s = styles[variant] || styles.teal;
  return (
    <div style={{ background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 8, padding: "14px 16px", marginBottom: 12 }}>
      {label && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: s.labelColor, marginBottom: 6 }}>{label}</div>}
      <div style={{ fontSize: 14, color: C.textPrimary, lineHeight: 1.6 }}>{text}</div>
    </div>
  );
}

function SectionHeader({ text }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.teal, borderBottom: `1.5px solid ${C.border}`, paddingBottom: 6, marginTop: 18, marginBottom: 10 }}>{text}</div>
  );
}

function ListBlock({ items, numbered }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px" }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: `1px solid ${C.border}`, fontSize: 14, color: C.textPrimary, lineHeight: 1.5 }}>
          <span style={{ color: C.gold, fontWeight: 700, minWidth: 20, flexShrink: 0 }}>{numbered ? `${i+1}.` : "›"}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function TableBlock({ headers, rows }) {
  return (
    <div style={{ overflowX: "auto", marginBottom: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ background: C.teal, color: C.white, padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: 12 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? C.white : C.tealPale }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: "8px 12px", color: C.textPrimary, borderBottom: `1px solid ${C.border}` }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PillarsBlock({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px" }}>
          <span style={{ fontSize: 24, flexShrink: 0 }}>{item.icon}</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.teal, marginBottom: 3 }}>{item.title}</div>
            <div style={{ fontSize: 13, color: C.textMid, lineHeight: 1.5 }}>{item.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TrioBlock({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{item.icon}</div>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.teal, marginBottom: 5 }}>{item.title}</div>
          <div style={{ fontSize: 12, color: C.textMid, lineHeight: 1.5 }}>{item.text}</div>
        </div>
      ))}
    </div>
  );
}

function RolesBlock({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{ borderLeft: `4px solid ${item.color}`, background: C.white, borderRadius: "0 8px 8px 0", padding: "12px 14px", border: `1px solid ${C.border}`, borderLeft: `4px solid ${item.color}` }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: item.color, marginBottom: 6 }}>{item.role}</div>
          {item.responsibilities.map((r, j) => (
            <div key={j} style={{ fontSize: 13, color: C.textMid, marginBottom: 2 }}>• {r}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

function FocusAreasBlock({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ width: 28, height: 28, background: C.teal, color: C.white, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{item.num}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.teal, marginBottom: 2 }}>{item.title}</div>
            <div style={{ fontSize: 13, color: C.textMid, lineHeight: 1.5 }}>{item.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TagsBlock({ items }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
      {items.map((tag, i) => (
        <span key={i} style={{ background: C.goldLight, border: `1px solid ${C.gold}`, borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600, color: C.tealDark }}>{tag}</span>
      ))}
    </div>
  );
}

function ClubsBlock({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, marginBottom: 12 }}>
      {items.map((club, i) => (
        <div key={i} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
          {club.img ? (
            <img
              src={club.img}
              alt={club.name}
              style={{ width: 40, height: 40, objectFit: "contain", flexShrink: 0 }}
            />
          ) : (
            <span style={{ fontSize: 22, flexShrink: 0 }}>{club.emoji}</span>
          )}
          <div>
            <div style={{ fontWeight: 600, fontSize: 12, color: C.teal, marginBottom: 4 }}>{club.name}</div>
            <div style={{ fontSize: 12, color: C.textMid, lineHeight: 1.4 }}>{club.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ServicesBlock({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
      {items.map((svc, i) => (
        <div key={i} style={{ background: C.tealPale, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{svc.icon}</div>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.teal, marginBottom: 8 }}>{svc.title}</div>
          {svc.times.map((t, j) => (
            <div key={j} style={{ fontSize: 12, color: C.textMid, marginBottom: 3 }}>{t}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TimelineBlock({ items }) {
  return (
    <div style={{ position: "relative", marginBottom: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
            <div style={{ background: item.color, color: C.white, borderRadius: 6, padding: "4px 8px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", minWidth: 60, textAlign: "center" }}>{item.time}</div>
            {i < items.length - 1 && <div style={{ width: 2, flex: 1, background: C.border, minHeight: 20, marginTop: 4 }} />}
          </div>
          <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.teal, marginBottom: 6 }}>{item.title}</div>
            {item.steps.map((step, j) => (
              <div key={j} style={{ fontSize: 13, color: C.textMid, marginBottom: 3 }}>• {step}</div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function OWNAGuideBlock({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ background: C.teal, color: C.white, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>OWNA</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.teal, marginBottom: 3 }}>{item.action}</div>
            <div style={{ fontSize: 12, color: C.textMid, fontFamily: "monospace", background: C.tealPale, borderRadius: 4, padding: "2px 6px", display: "inline-block" }}>{item.path}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ChecklistBlock({ title, items }) {
  const [checked, setChecked] = useState({});
  const toggle = (i) => setChecked(prev => ({ ...prev, [i]: !prev[i] }));
  return (
    <div style={{ background: C.greenLight, border: `1.5px solid ${C.green}`, borderRadius: 8, padding: "14px 16px", marginBottom: 12 }}>
      {title && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.green, marginBottom: 10 }}>{title}</div>}
      {items.map((item, i) => (
        <div key={i} onClick={() => toggle(i)} style={{ display: "flex", gap: 10, alignItems: "center", padding: "5px 0", cursor: "pointer" }}>
          <div style={{ width: 18, height: 18, border: `2px solid ${C.green}`, borderRadius: 4, background: checked[i] ? C.green : C.white, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {checked[i] && <span style={{ color: C.white, fontSize: 12, fontWeight: 700 }}>✓</span>}
          </div>
          <span style={{ fontSize: 13, color: checked[i] ? C.textMuted : C.textPrimary, textDecoration: checked[i] ? "line-through" : "none" }}>{item}</span>
        </div>
      ))}
    </div>
  );
}

function TrainingBlock({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: C.teal, marginBottom: 3 }}>{item.code}</div>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.textPrimary, marginBottom: 4 }}>{item.title}</div>
            <div style={{ fontSize: 12, color: C.textMuted }}>{item.delivery} · {item.who}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.teal }}>{item.price}</div>
            {item.covered && <div style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>50% covered ✓</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function ClearBlock({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ width: 36, height: 36, background: C.teal, color: C.white, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 18, flexShrink: 0 }}>{item.letter}</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: C.teal }}>{item.word}</div>
            <div style={{ fontSize: 13, color: C.textMid }}>{item.desc}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RatiosBlock({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: C.teal, fontFamily: "Georgia, serif" }}>{item.ratio}</div>
          <div style={{ fontSize: 12, color: C.textMid, marginTop: 4 }}>{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function MTOPBlock({ items }) {
  const colors = [C.teal, "#2E7D32", "#5C6BC0", "#E65100", "#C62828"];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{ background: C.white, border: `1.5px solid ${colors[i]}`, borderRadius: 10, padding: 14 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: colors[i], fontFamily: "Georgia, serif", marginBottom: 6 }}>{item.num}</div>
          <div style={{ fontWeight: 700, fontSize: 13, color: C.teal, marginBottom: 8, lineHeight: 1.4 }}>{item.title}</div>
          {item.points.map((p, j) => (
            <div key={j} style={{ fontSize: 12, color: C.textMid, marginBottom: 4, lineHeight: 1.4 }}>• {p}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

function StandardsBlock({ items }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 12, background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", alignItems: "flex-start" }}>
          <div style={{ background: C.teal, color: C.white, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>Std {item.num}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.teal, marginBottom: 2 }}>{item.title}</div>
            <div style={{ fontSize: 13, color: C.textMid, lineHeight: 1.5 }}>{item.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AbuseTypesBlock({ items }) {
  const [open, setOpen] = useState(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{ background: C.white, border: `1.5px solid ${item.color}`, borderRadius: 8, overflow: "hidden" }}>
          <div onClick={() => setOpen(open === i ? null : i)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", cursor: "pointer", background: open === i ? item.color + "15" : C.white }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: item.color }}>{item.type}</div>
            <span style={{ fontSize: 16, color: item.color }}>{open === i ? "−" : "+"}</span>
          </div>
          {open === i && (
            <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${item.color}30` }}>
              <p style={{ fontSize: 13, color: C.textPrimary, lineHeight: 1.6, margin: "10px 0" }}>{item.definition}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: item.color, marginBottom: 6 }}>Behavioural Indicators</div>
                  {item.behavioural.map((b, j) => <div key={j} style={{ fontSize: 12, color: C.textMid, marginBottom: 3 }}>• {b}</div>)}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: item.color, marginBottom: 6 }}>Physical Indicators</div>
                  {item.physical.map((p, j) => <div key={j} style={{ fontSize: 12, color: C.textMid, marginBottom: 3 }}>• {p}</div>)}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ContactsBlock({ items }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{ background: C.redLight, border: `1.5px solid ${C.red}`, borderRadius: 10, padding: 14, textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: C.red }}>{item.state}</div>
          <div style={{ fontSize: 12, color: C.textMid, margin: "4px 0" }}>{item.org}</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: C.teal, fontFamily: "Georgia, serif" }}>{item.phone}</div>
        </div>
      ))}
    </div>
  );
}

function PayrollCard({ items }) {
  return (
    <div style={{ background: C.goldLight, border: `2px solid ${C.gold}`, borderRadius: 10, padding: 20, marginBottom: 12 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : "none" }}>
          <span style={{ fontSize: 13, color: C.textMid, fontWeight: 600 }}>{item.label}</span>
          <span style={{ fontSize: 13, color: C.tealDark, fontWeight: 700 }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function PolicyChecklistBlock({ items }) {
  const [checked, setChecked] = useState({});
  const toggle = (i) => setChecked(prev => ({ ...prev, [i]: !prev[i] }));
  const allChecked = items.every((_, i) => checked[i]);
  return (
    <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.teal, marginBottom: 10 }}>I acknowledge that I have read and understood the following policies:</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
        {items.map((item, i) => (
          <div key={i} onClick={() => toggle(i)} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 6px", cursor: "pointer", borderRadius: 4, background: checked[i] ? C.greenLight : "transparent" }}>
            <div style={{ width: 16, height: 16, border: `2px solid ${checked[i] ? C.green : C.border}`, borderRadius: 3, background: checked[i] ? C.green : C.white, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {checked[i] && <span style={{ color: C.white, fontSize: 10, fontWeight: 700 }}>✓</span>}
            </div>
            <span style={{ fontSize: 12, color: checked[i] ? C.green : C.textMid, textDecoration: checked[i] ? "line-through" : "none" }}>{item}</span>
          </div>
        ))}
      </div>
      {allChecked && (
        <div style={{ marginTop: 12, background: C.greenLight, border: `1px solid ${C.green}`, borderRadius: 6, padding: "8px 12px", fontSize: 13, color: C.green, fontWeight: 600, textAlign: "center" }}>
          ✓ All policies acknowledged
        </div>
      )}
    </div>
  );
}

function DeclarationsBlock({ items }) {
  const [checked, setChecked] = useState({});
  const toggle = (i) => setChecked(prev => ({ ...prev, [i]: !prev[i] }));
  return (
    <div style={{ marginBottom: 12 }}>
      {items.map((item, i) => (
        <div key={i} onClick={() => toggle(i)} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
          <div style={{ width: 20, height: 20, border: `2px solid ${checked[i] ? C.green : C.border}`, borderRadius: 4, background: checked[i] ? C.green : C.white, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
            {checked[i] && <span style={{ color: C.white, fontSize: 12, fontWeight: 700 }}>✓</span>}
          </div>
          <span style={{ fontSize: 14, color: C.textPrimary, lineHeight: 1.5 }}>{item}</span>
        </div>
      ))}
    </div>
  );
}

function SignOffForm() {
  const [vals, setVals] = useState({ name: "", position: "", service: "", date: "" });
  const set = (k) => (e) => setVals(prev => ({ ...prev, [k]: e.target.value }));
  return (
    <div style={{ background: C.white, border: `1.5px solid ${C.border}`, borderRadius: 10, padding: 20, marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: C.teal, marginBottom: 14 }}>Educator Declaration</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { key: "name", label: "Educator Name" },
          { key: "position", label: "Position" },
          { key: "service", label: "Service Location" },
          { key: "date", label: "Date", type: "date" },
        ].map(field => (
          <div key={field.key}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>{field.label}</label>
            <input
              type={field.type || "text"}
              value={vals[field.key]}
              onChange={set(field.key)}
              style={{ width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 6, padding: "8px 10px", fontSize: 13, color: C.textPrimary, background: C.cream, outline: "none", boxSizing: "border-box" }}
            />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Educator Signature</label>
        <div style={{ border: `1.5px dashed ${C.border}`, borderRadius: 6, height: 60, background: C.cream, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontSize: 12 }}>Sign here</div>
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Supervisor / Director Signature</label>
        <div style={{ border: `1.5px dashed ${C.border}`, borderRadius: 6, height: 60, background: C.cream, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMuted, fontSize: 12 }}>Sign here</div>
      </div>
    </div>
  );
}

function PolicyIntro({ text }) {
  return (
    <div style={{ fontSize: 14, color: C.textMid, fontStyle: "italic", background: C.tealPale, borderLeft: `3px solid ${C.teal}`, borderRadius: "0 6px 6px 0", padding: "10px 14px", marginBottom: 12, lineHeight: 1.6 }}>{text}</div>
  );
}

function AckIntro({ text }) {
  return (
    <div style={{ fontSize: 14, color: C.textPrimary, lineHeight: 1.7, marginBottom: 14 }}>{text}</div>
  );
}

function renderContent(block, idx) {
  switch (block.type) {
    case "callout":         return <CalloutBlock key={idx} {...block} />;
    case "section-header":  return <SectionHeader key={idx} text={block.text} />;
    case "list":            return <ListBlock key={idx} items={block.items} numbered={block.numbered} />;
    case "table":           return <TableBlock key={idx} headers={block.headers} rows={block.rows} />;
    case "pillars":         return <PillarsBlock key={idx} items={block.items} />;
    case "trio":            return <TrioBlock key={idx} items={block.items} />;
    case "roles":           return <RolesBlock key={idx} items={block.items} />;
    case "focus-areas":     return <FocusAreasBlock key={idx} items={block.items} />;
    case "tags":            return <TagsBlock key={idx} items={block.items} />;
    case "clubs":           return <ClubsBlock key={idx} items={block.items} />;
    case "services":        return <ServicesBlock key={idx} items={block.items} />;
    case "timeline":        return <TimelineBlock key={idx} items={block.items} />;
    case "owna-guide":      return <OWNAGuideBlock key={idx} items={block.items} />;
    case "checklist":       return <ChecklistBlock key={idx} title={block.title} items={block.items} />;
    case "training":        return <TrainingBlock key={idx} items={block.items} />;
    case "clear":           return <ClearBlock key={idx} items={block.items} />;
    case "ratios":          return <RatiosBlock key={idx} items={block.items} />;
    case "mtop":            return <MTOPBlock key={idx} items={block.items} />;
    case "standards":       return <StandardsBlock key={idx} items={block.items} />;
    case "abuse-types":     return <AbuseTypesBlock key={idx} items={block.items} />;
    case "contacts":        return <ContactsBlock key={idx} items={block.items} />;
    case "payroll-card":    return <PayrollCard key={idx} items={block.items} />;
    case "policy-checklist":return <PolicyChecklistBlock key={idx} items={block.items} />;
    case "declarations":    return <DeclarationsBlock key={idx} items={block.items} />;
    case "sign-off-form":   return <SignOffForm key={idx} />;
    case "policy-intro":    return <PolicyIntro key={idx} text={block.text} />;
    case "ack-intro":       return <AckIntro key={idx} text={block.text} />;
    default:                return null;
  }
}

// ─── ACCORDION ────────────────────────────────────────────────────────────────
function Accordion({ subsection, accentColor }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 10, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.white }}>
      <div onClick={() => setOpen(!open)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", cursor: "pointer", background: open ? accentColor + "12" : C.white, borderBottom: open ? `1px solid ${accentColor}30` : "none", transition: "background 0.15s" }}>
        <span style={{ fontWeight: 600, fontSize: 14, color: open ? accentColor : C.textPrimary }}>{subsection.title}</span>
        <span style={{ fontSize: 18, color: accentColor, fontWeight: 300 }}>{open ? "−" : "+"}</span>
      </div>
      {open && (
        <div style={{ padding: "16px 18px" }}>
          {subsection.content.map((block, i) => renderContent(block, i))}
        </div>
      )}
    </div>
  );
}

// ─── SEARCH ───────────────────────────────────────────────────────────────────
function searchHandbook(query) {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const results = [];
  SECTIONS.forEach(sec => {
    sec.subsections.forEach(sub => {
      const titleMatch = sub.title.toLowerCase().includes(q);
      const contentStr = JSON.stringify(sub.content).toLowerCase();
      if (titleMatch || contentStr.includes(q)) {
        results.push({ sectionId: sec.id, sectionLabel: sec.label, subsection: sub, color: sec.color });
      }
    });
  });
  return results;
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function AmanaHandbookPanel() {
  const [activeSection, setActiveSection] = useState("welcome");
  const [search, setSearch] = useState("");

  const section = SECTIONS.find(s => s.id === activeSection);
  const searchResults = search.length > 1 ? searchHandbook(search) : [];
  const isSearching = search.length > 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.cream, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* ── HEADER ── */}
      <div style={{ background: C.teal, padding: "20px 28px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ background: C.gold, width: 6, height: 36, borderRadius: 3 }} />
          <div>
            <div style={{ color: C.white, fontSize: 20, fontWeight: 700, fontFamily: "Georgia, serif", letterSpacing: "-0.01em" }}>Educators Induction Module</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 1 }}>Amana OSHC · Interactive Handbook</div>
          </div>
        </div>

        {/* Search bar */}
        <div style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10, padding: "0 12px", marginBottom: 16 }}>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>🔍</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search handbook…"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: C.white, fontSize: 13, padding: "10px 0", "::placeholder": { color: "rgba(255,255,255,0.4)" } }}
          />
          {search && <span onClick={() => setSearch("")} style={{ color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 16 }}>×</span>}
        </div>

        {/* Tab nav */}
        {!isSearching && (
          <div style={{ display: "flex", gap: 4, overflowX: "auto" }}>
            {SECTIONS.map(sec => (
              <button key={sec.id} onClick={() => setActiveSection(sec.id)} style={{ background: activeSection === sec.id ? C.gold : "rgba(255,255,255,0.1)", color: activeSection === sec.id ? C.tealDark : "rgba(255,255,255,0.75)", border: "none", borderRadius: "8px 8px 0 0", padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.15s" }}>
                {sec.icon} {sec.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── CONTENT ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
        {isSearching ? (
          <div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 14 }}>
              {searchResults.length > 0 ? `${searchResults.length} result${searchResults.length === 1 ? "" : "s"} for "${search}"` : `No results found for "${search}"`}
            </div>
            {searchResults.map((result, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: result.color, marginBottom: 4 }}>{result.sectionLabel}</div>
                <Accordion subsection={result.subsection} accentColor={result.color} />
              </div>
            ))}
          </div>
        ) : (
          section && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <div style={{ width: 4, height: 24, background: section.color, borderRadius: 2 }} />
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.tealDark, fontFamily: "Georgia, serif" }}>{section.label}</h2>
              </div>
              {section.subsections.map((sub, i) => (
                <Accordion key={i} subsection={sub} accentColor={section.color} />
              ))}
            </div>
          )
        )}
      </div>

      {/* ── FOOTER ── */}
      <div style={{ background: C.tealDark, padding: "10px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Amana OSHC · Educators Induction Module</span>
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>Beyond The Bell</span>
      </div>
    </div>
  );
}
