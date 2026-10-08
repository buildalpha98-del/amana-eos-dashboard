/**
 * Parent welcome pack — HTML template, printed to A4 PDF by build.ts.
 *
 * Every page is a fixed 210 × 297mm box, so nothing ever splits across a
 * page break (the first print run flowed freely and orphaned headings and
 * cards). build.ts fails the run if any page's content overflows its box.
 *
 * Brand: Midnight Green #004E64, Jonquil #FECE00, Lemon Chiffon #FFF2BF,
 * Cosmic Latte #FFFAE6. Somatic and DIN Condensed aren't web-licensed, so
 * Fredoka (rounded geometric) and Barlow Condensed stand in for them.
 */
import type { WelcomePackCentre } from "./centres";

const HEAD_OFFICE = "1300 200 262";
const HEAD_OFFICE_TEL = "1300200262";
const ENROL_EMAIL = "enrolment@amanaoshc.com.au";
const WHATSAPP_URL = "https://chat.whatsapp.com/JU9ab3hMupbHzrfa5eS8Ko";

export interface TemplateAssets {
  /** file:// URL of a directory holding the per-centre jpgs + whatsapp-qr.png */
  assetBase: string;
  /** file:// URL of the repo's public/ directory */
  publicBase: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The first school year is Kindergarten in NSW and Prep in Victoria. */
const firstYears = (c: WelcomePackCentre) => (c.state === "VIC" ? "Prep and Year 1" : "Kindergarten and Year 1");

const REGULATOR: Record<WelcomePackCentre["state"], { name: string; phone: string; web: string }> = {
  NSW: { name: "NSW Early Learning Commission", phone: "1800 619 113", web: "earlylearningcommission.nsw.gov.au" },
  VIC: { name: "Victorian Early Childhood Regulatory Authority (VECRA)", phone: "1300 307 415", web: "vecra.vic.gov.au" },
};

const tel = (phone: string) => `tel:${phone.replace(/\s+/g, "")}`;

/* ------------------------------------------------------------------ */
/* Decoration                                                          */
/* ------------------------------------------------------------------ */



/* ------------------------------------------------------------------ */
/* Brand shapes — the three paths of the real logo (public/logo-icon.svg).
 * The guidelines build every graphic element from these: Sun Rays, Pupil,
 * A and Bell (A + Pupil). The corner bursts on the guideline cover are the
 * rays plus the same rays turned 180°. Never draw a substitute.           */
/* ------------------------------------------------------------------ */
const RAYS_D =
  "M80.3139 53.2903H112.291C115.445 53.2903 118 55.8452 118 58.9989C118 62.1527 115.445 64.7075 112.291 64.7075H80.3139H37.6861H5.7087C2.55491 64.7075 0 62.1527 0 58.9989C0 55.8452 2.55491 53.2903 5.7087 53.2903H37.6861L9.99131 37.3019C7.25975 35.7251 6.32481 32.231 7.90171 29.4995C9.4786 26.768 12.9728 25.833 15.7043 27.4099L43.3991 43.4026L27.4104 15.7083C25.8335 12.9768 26.7684 9.48274 29.5 7.90587C32.2316 6.32901 35.7257 7.26392 37.3026 9.99544L53.2913 37.6854V5.7086C53.2913 2.55487 55.8462 0 59 0C62.1538 0 64.7087 2.55487 64.7087 5.7086V37.6854L80.6974 9.99113C82.2743 7.25962 85.7684 6.3247 88.5 7.90156C91.2316 9.47843 92.1665 12.9725 90.5896 15.704L74.6009 43.3983L102.296 27.4099C105.027 25.833 108.521 26.768 110.098 29.4995C111.675 32.231 110.74 35.7251 108.009 37.3019L80.3139 53.2903Z";
const PUPIL_D =
  "M72.6534 133.188C75.2024 133.188 77.1206 135.596 76.4451 138.05C74.3102 145.85 67.1729 151.579 58.6973 151.579C50.2217 151.579 43.0844 145.844 40.9496 138.05C40.2804 135.596 42.1986 133.188 44.7413 133.188H72.647H72.6534Z";
const A_D =
  "M79.631 126.661L63.4318 81.0143C61.6793 76.0755 54.6949 76.0628 52.9233 81.0016L36.5712 126.668L30.9187 143.81L21.5573 169.192C20.748 171.384 18.6577 172.837 16.3254 172.837H6.25025C2.35658 172.837 -0.339039 168.95 1.03107 165.305L45.3463 47.112C46.162 44.9325 48.2458 43.4923 50.5655 43.4923H66.5798C68.9122 43.4923 71.0024 44.9453 71.8118 47.1374L115.42 165.324C116.764 168.963 114.069 172.831 110.188 172.831H99.5773C97.1939 172.831 95.0718 171.314 94.3007 169.058L85.6658 143.797L79.631 126.655V126.661Z";

const rays = (cls: string) =>
  `<svg class="${cls}" viewBox="0 0 118 65" aria-hidden="true"><path d="${RAYS_D}" fill="currentColor"/></svg>`;
const burst = (cls: string) =>
  `<svg class="${cls}" viewBox="0 0 118 118" aria-hidden="true"><path d="${RAYS_D}" fill="currentColor"/><path d="${RAYS_D}" fill="currentColor" transform="rotate(180 59 59)"/></svg>`;
const bell = (cls: string) =>
  `<svg class="${cls}" viewBox="0 43 118 130" aria-hidden="true"><path d="${A_D}" fill="currentColor"/><path d="${PUPIL_D}" fill="currentColor"/></svg>`;
const mark = (cls: string) =>
  `<svg class="${cls}" viewBox="0 0 118 173" aria-hidden="true"><path d="${RAYS_D}" fill="currentColor"/><path d="${A_D}" fill="currentColor"/><path d="${PUPIL_D}" fill="currentColor"/></svg>`;

const SECTION_NO: Record<string, string> = {
  "Finding us": "01",
  "Getting started": "02",
  "Fees and Child Care Subsidy": "03",
  "Paying and invoices": "04",
  "Booking and changes": "05",
  "Drop-off and pick-up": "06",
  "Food and health": "07",
  "Our programs": "08",
  "Good to know": "09",
  "Staying in touch": "10",
  "Quick answers": "11",
};

const ICONS: Record<string, string> = {
  phone:
    '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  door: '<path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17"/><path d="M3 21h18"/><circle cx="15" cy="12" r="1"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  heart:
    '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  food: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2.5-3 6h3v12"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6.5V8M12 16v1.5"/>',
  card: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>',
  device: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7c-3 0-4.5-1.5-6-4l-1.6-2.8a1.5 1.5 0 0 1 2.6-1.5L8 15"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
};

const icon = (name: string, cls = "ico") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

function sectionHead(eyebrow: string, title: string, intro?: string): string {
  const no = SECTION_NO[eyebrow];
  return `<header class="sec">
    <div class="sec-top">
      <div>
        <div class="eyebrow">${esc(eyebrow)}</div>
        <h2>${title}</h2>
      </div>
      ${no ? `<span class="sec-no">${no}</span>` : ""}
    </div>
    ${intro ? `<p class="lede">${intro}</p>` : ""}
  </header>`;
}

function card(title: string, body: string, opts: { icon?: string; tone?: "white" | "chiffon" | "green"; cls?: string } = {}): string {
  const { tone = "white", cls = "" } = opts;
  return `<div class="card card-${tone} ${cls}">
    <h3>${title}</h3>
    ${body}
  </div>`;
}

function steps(items: Array<[string, string]>, opts: { marker?: "num" | "alpha"; cls?: string } = {}): string {
  const { marker = "num", cls = "" } = opts;
  return `<ol class="steps ${cls}">${items
    .map(
      ([t, b], i) => `<li>
        <span class="badge">${marker === "alpha" ? String.fromCharCode(97 + i) : i + 1}</span>
        <div><strong>${t}</strong><p>${b}</p></div>
      </li>`,
    )
    .join("")}</ol>`;
}

function bullets(items: string[]): string {
  return `<ul class="bullets">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
}

function page(c: WelcomePackCentre, n: number, body: string, opts: { cls?: string; footer?: boolean } = {}): string {
  const { cls = "", footer = true } = opts;
  return `<section class="page ${cls}">
    <div class="page-body">${body}</div>
    ${
      footer
        ? `<footer class="foot">
      <span class="foot-l"><img src="__PUBLIC__/logo-icon-green.svg" alt=""/>Amana OSHC ${esc(c.name)}</span>
      <span class="foot-r">Parent Welcome Pack<span class="pg">${n}</span></span>
    </footer>`
        : ""
    }
  </section>`;
}

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */

function cover(c: WelcomePackCentre): string {
  return `<section class="page cover">
    ${burst("cv-burst cv-b1")}
    ${burst("cv-burst cv-b2")}
    ${burst("cv-burst cv-b3")}
    <div class="cover-main">
      <img class="cover-logo" src="__ASSETS__/brand/logo-latte.svg" alt="Amana OSHC"/>
      <p class="cover-tag">Parent Welcome Pack</p>
      <div class="cover-centre">
        <span class="cover-centre-v">${esc(c.name)}</span>
        ${c.address ? `<span class="cover-centre-a">${esc(c.address)}</span>` : ""}
      </div>
    </div>
    <p class="cover-btb">Beyond The Bell</p>
  </section>`;
}

function welcomePage(c: WelcomePackCentre, a: TemplateAssets): string {
  const contents: Array<[string, string, number]> = [
    ["Finding us", "Drop-off and pick-up map", 3],
    ["Getting started", "Four steps to the first day", 4],
    ["Fees and CCS", "How fees and the subsidy work", 5],
    ["Paying and invoices", "Three ways to pay", 7],
    ["Booking and OWNA", "Booking, absences and changes", 8],
    ["Drop-off and pick-up", "Handing over safely", 9],
    ["Food and health", "Halal, nut-free and safe", 10],
    ["Our programs", "What your child will get up to", 11],
    ["Good to know", "Belongings, excursions and safety", 12],
    ["Staying in touch", "Who to contact and how", 13],
    ["Questions", "Frequently asked questions", 14],
  ];
  const initials = c.coordinator
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return page(
    c,
    2,
    `<div class="welcome-grid">
      <div class="letter">
        ${sectionHead("A note from us", "Welcome to the Amana OSHC family")}
        <p class="big">Assalamu Alaikum, and thank you for choosing us.</p>
        <p>We are so glad your family is joining Amana OSHC ${esc(c.name)}. Our team is here to give your child a safe, warm and fun place to learn and play before and after the school day, rooted in values that matter.</p>
        <p>This pack covers what happens next, how fees and booking work, and everything you need for your child's first day. Keep it handy, and call us any time if you have a question. We are always happy to help.</p>
        <p class="sign">Warm regards,<br/><strong>The Amana OSHC team</strong></p>
        <img class="lockup" src="__ASSETS__/brand/beyond-the-bell.png" alt="Beyond The Bell"/>
        <div class="coord">
          ${
            c.photo
              ? `<img class="avatar" src="${a.assetBase}/${c.photo}" alt="${esc(c.coordinator)}"/>`
              : `<span class="avatar avatar-i">${initials}</span>`
          }
          <div class="coord-who">
            <span class="k">Your Service Coordinator</span>
            <span class="name">${esc(c.coordinator)}</span>
            <p>Your first point of contact for anything about your child's day.</p>
          </div>
          <div class="coord-contact">
            <a href="${tel(c.phone)}"><span class="k">Service number</span><span class="v big">${esc(c.phone)}</span></a>
            <a href="mailto:${c.email}"><span class="k">Service email</span><span class="v">${esc(c.email)}</span></a>
          </div>
        </div>
      </div>
      <aside class="contents">
        <h3>Inside this pack</h3>
        <ol>${contents
          .map(
            ([t, s, p]) => `<li><span class="ct"><strong>${t}</strong><em>${s}</em></span><span class="cp">${p}</span></li>`,
          )
          .join("")}</ol>
      </aside>
    </div>`,
  );
}

function findingUsPage(c: WelcomePackCentre, a: TemplateAssets): string {
  return page(
    c,
    3,
    `${sectionHead("Finding us", "Drop-off and pick-up", c.address ? `Amana OSHC ${esc(c.name)} &middot; ${esc(c.address)}` : `Amana OSHC ${esc(c.name)}`)}
    <div class="find">
      <figure class="map">
        <img src="${a.assetBase}/${c.map}" alt="Map of the school showing where to find Amana OSHC"/>
      </figure>
      <aside class="find-aside">
        <div class="where">
          <span class="k">Come to</span>
          <span class="v">${esc(c.dropOff)}</span>
          <p>For every drop-off and pick-up. Please come into the service, not the gate or car park.</p>
          ${
            c.earlyWednesday
              ? `<p class="wed"><strong>Wednesdays:</strong> your school finishes early, so Wednesday sessions run ${c.earlyWednesday} to 6:30pm.</p>`
              : ""
          }
        </div>
        <div class="legend">
          <h3>Reading the map</h3>
          <div><i class="key key-pin"></i><span><strong>Red pin</strong>Enter the school here</span></div>
          <div><i class="key key-line"></i><span><strong>Yellow line</strong>Walk this way</span></div>
          <div><i class="key key-star"></i><span><strong>Gold star</strong>Amana OSHC</span></div>
        </div>
        <div class="hours">
          ${c.hasBsc ? `<div><span class="k">Before school</span><span class="v">Opens two hours before the bell</span></div>` : ""}
          <div><span class="k">After school</span><span class="v">Final bell to 6:30pm</span></div>
        </div>
        <p class="spot"><strong>Spotting our team:</strong> yellow lanyards with name tags and black Amana OSHC tees.</p>
      </aside>
    </div>`,
  );
}

function gettingStartedPage(c: WelcomePackCentre): string {
  const timeline: Array<[string, string]> = [
    ["We receive your form", "Once you submit your enrolment form, our team gets straight to work on it."],
    ["We give you a call", "We will phone you to confirm your details and answer any questions you have."],
    [
      "Confirm in myGov",
      "Once we notify Centrelink that your child is attending, you will be asked to confirm the enrolment in myGov. New to CCS? Make a new claim first (page 6).",
    ],
    ["Your child joins in", "Sessions are confirmed, and your child's first day is on. Nothing is charged until after it."],
  ];
  return page(
    c,
    4,
    `${sectionHead("Getting started", "Four steps to your child's first day")}
    <ol class="timeline">${timeline
      .map(
        ([t, b], i) => `<li>
          <span class="tl-num">${i + 1}</span>
          <strong>${t}</strong>
          <p>${b}</p>
        </li>`,
      )
      .join("")}</ol>

    <div class="first-day">
      <div class="first-day-head">
        <div class="eyebrow dark">Before the first day</div>
        <h2 class="h3size">Before your child's first day</h2>
      </div>
      <div class="fd-items">
        <div class="fd">
          <span class="badge">1</span>
          <h3>Tell your child they are coming to Amana</h3>
          <p>Some children forget, and then wait at the gate for you. Let your child know before their first day that they will be with us after school.</p>
        </div>
        <div class="fd">
          <span class="badge">2</span>
          <h3>Drop by and say hello</h3>
          <p>If it is your first time, come and view the service so you know where it is, and meet our educators. Our team wear yellow lanyards with name tags and black Amana OSHC tees, so we are easy to spot.</p>
        </div>
        <div class="fd">
          <span class="badge">3</span>
          <h3>There is nothing extra to pack</h3>
          <p>Your child does not need to bring anything special for us. Homework is simply whatever the school has set for the day, and we set aside time every session for reading and homework.</p>
        </div>
      </div>
    </div>`,
  );
}

function feesPage(c: WelcomePackCentre): string {
  return page(
    c,
    5,
    `${sectionHead(
      "Fees and Child Care Subsidy",
      "How fees work",
      "Fees are charged <strong>one week in arrears</strong>. If your child attends in week one, you are charged on the Wednesday of week two, after your Child Care Subsidy (CCS) has been taken off.",
    )}
    <div class="callout">
      <p><strong>Fees apply to every booked session</strong>, including absences and any session that falls on a public holiday during term time, because our staffing and resourcing costs are fixed. <strong>The one exception is illness:</strong> if your child is unwell and you provide a medical certificate, there is no charge, for regular and casual bookings alike.</p>
    </div>
    <div class="two">
      <div class="receipt">
        <div class="receipt-head">
          <span class="eyebrow dark">A worked example</span>
          <p>Your child starts and attends 3 after school sessions in their first week.</p>
        </div>
        <div class="receipt-rows">
          <div class="r"><span>3 sessions at $38.60</span><span>$115.80</span></div>
          <div class="r minus"><span>CCS paid to us at 80%</span><span>&minus;$92.64</span></div>
          <div class="r total"><span>You pay on Wednesday<br/>of week two</span><span>$23.16</span></div>
        </div>
        <p class="fine">Example only. Your CCS rate depends on your family income and is assessed by Services Australia.</p>
      </div>
      <div class="gap-explain">
        <h3>How the CCS gap works</h3>
        <p>The government pays a percentage of each session fee, up to 90% depending on your family income, straight to us. The part left over is called the gap, and the gap is all you pay.</p>
        <h4>Who qualifies?</h4>
        ${bullets([
          "Your child is 13 or under and not in secondary school",
          "Your child meets immunisation requirements",
          "You or your partner meet residency requirements",
          "You do <strong>not</strong> need to be on Centrelink already",
        ])}
      </div>
    </div>
    <div class="two tight">
      ${card("Late pick-up", "<p>We close at 6:30pm. After that, late pick-up is <strong>$15 for every 15 minutes, per child</strong>. It covers the educators staying back with your child. If you are running late, please call us.</p>", { icon: "clock" })}
      ${card("No hidden extras", "<p>There is <strong>no registration fee, no enrolment fee and no bond</strong>.</p><p class='fine'>Swapping, make-up sessions and refunds for non-attendance are not possible because of government subsidy regulations.</p>", { icon: "star", tone: "chiffon" })}
    </div>
`,
  );
}

function ccsPage(c: WelcomePackCentre): string {
  const rows = [
    c.hasBsc ? ["Rise and Shine Club", "before school", "$27.56", "$33.07", "$2.76"] : null,
    ["Amana Afternoons", "after school", "$38.60", "$44.10", "$3.86"],
  ].filter(Boolean) as string[][];
  const from = c.hasBsc
    ? "From <strong>$2.76</strong> a session for before school care and <strong>$3.86</strong> for after school care"
    : "From <strong>$3.86</strong> a session for after school care";
  return page(
    c,
    6,
    `${sectionHead(
      "Fees and Child Care Subsidy",
      "Your Child Care Subsidy in two steps",
      "There are two separate steps to get your CCS working with us. Step 1 is only for some families. Step 2 is for everyone.",
    )}
    <div class="ccs-steps">
      <div class="ccs ccs-1">
        <span class="ccs-tag">Step 1 &middot; Some families</span>
        <h3>Make a new CCS claim with Centrelink</h3>
        <p>Do this if you have not used the Child Care Subsidy before, or if your child has not been enrolled in any form of approved care in the last 26 weeks. If your child has been in approved care within the last 26 weeks, skip to Step 2.</p>
        ${steps(
          [
            ["Set up myGov and link Centrelink", "Create a myGov account if you do not have one, then link Centrelink to it."],
            ["Make the claim", "In myGov, go to Centrelink, then Payments and Claims, then Child Care Subsidy, and follow the prompts."],
            ["Give us your details", "Add your child's CRN and date of birth to your Amana enrolment, so we can notify Centrelink that your child is attending."],
          ],
          { marker: "alpha", cls: "compact" },
        )}
      </div>
      <div class="ccs ccs-2">
        <span class="ccs-tag">Step 2 &middot; Everyone</span>
        <h3>Confirm the enrolment in Centrelink</h3>
        <p>Once we send Centrelink a notification that your child is attending Amana OSHC, you will be asked to confirm the enrolment in myGov. <strong>Please approve it as soon as you see it</strong>, so your subsidy can be applied to your child's sessions.</p>
        <div class="help">
          ${icon("phone")}
          <p><strong>Stuck at any step?</strong> Call us on <a href="tel:${HEAD_OFFICE_TEL}">${HEAD_OFFICE}</a> and we will help, at no extra cost. Keep your income, hours and family details current in myGov.</p>
        </div>
      </div>
    </div>

    <h3 class="sub">Session fees</h3>
    <p class="mb">${from} once the maximum 90% subsidy is applied. You only ever pay the gap. The full fees before CCS are:</p>
    <table class="fees">
      <thead><tr><th>Session</th><th>Regular</th><th>Casual</th><th class="hl">From, after 90% CCS</th></tr></thead>
      <tbody>${rows
        .map(
          ([n, k, r, ca, f]) =>
            `<tr><td><strong>${n}</strong><em>${k}</em></td><td>${r}</td><td>${ca}</td><td class="hl">${f}</td></tr>`,
        )
        .join("")}</tbody>
    </table>
    <p class="fine">Want your exact gap? Use the calculator at <a href="https://amanaoshc.com.au/fees#calculator">amanaoshc.com.au/fees</a>.</p>`,
  );
}

function payPage(c: WelcomePackCentre): string {
  return page(
    c,
    7,
    `${sectionHead("Paying and invoices", "Three ways to pay")}
    <div class="pay-grid">
      <div class="pay">
        <span class="pay-n">1</span>
        <h3>Direct debit through OWNA</h3>
        <p>Set and forget, debited weekly.</p>
        <dl class="charges">
          <dt>Bank account</dt><dd>$0.75 per transaction</dd>
          <dt>Visa or Mastercard</dt><dd>1.56% plus $0.75</dd>
          <dt>Amex</dt><dd>1.56% plus $0.75</dd>
          <dt>Failed payment</dt><dd>$2.75</dd>
          <dt>Chargeback</dt><dd>$50</dd>
        </dl>
      </div>
      <div class="pay">
        <span class="pay-n">2</span>
        <h3>One-off payment in the OWNA app</h3>
        <p>Go to Home, then Statements and Invoices. Open your latest invoice, scroll to the bottom, and choose One-Off Payment.</p>
      </div>
      <div class="pay">
        <span class="pay-n">3</span>
        <h3>Direct deposit</h3>
        <dl class="bank">
          <dt>Account name</dt><dd>Amana OSHC PTY LTD</dd>
          <dt>BSB</dt><dd>062-692</dd>
          <dt>Account</dt><dd>8288 2065</dd>
        </dl>
        <p>Use your child's name and school code as the reference, for example MFISGreenacre.</p>
      </div>
    </div>

    <div class="invoice">
      <div class="invoice-head">
        <h3>How to read your invoice</h3>
        <p>Your weekly invoice is in the OWNA app under Statements and Invoices. Here is what each part means.</p>
      </div>
      <div>
        ${steps(
          [
            ["Invoice details", "Your account name, issue date and the statement period the invoice covers."],
            ["Transaction summary", "Your opening balance, then a line for each child's attendances that week with the sessions and total fee, followed by your CCS estimate as a credit."],
            ["Total due", "The amount you pay after the CCS estimate has been taken off."],
            ["CCS entitlements", "Your CCS percentage, the number of absence days used and your fortnightly hours."],
            ["Session details", "Each day your child attended, with the session fee, the CCS estimate and your gap. Fees are averaged per day over a two week cycle."],
          ],
          { cls: "compact" },
        )}
      </div>
    </div>`,
  );
}

function bookingPage(c: WelcomePackCentre): string {
  return page(
    c,
    8,
    `${sectionHead("Booking and changes", "Booking, absences and changes")}
    <div class="four">
      ${card("Regular bookings", "<p>Made at least one week in advance, with a minimum of two sessions a week. Cancelling a day needs <strong>7 days' notice</strong>.</p>", { icon: "calendar" })}
      ${card("Casual bookings", "<p>Casual sessions are non-cancellable. Once booked, the fee applies whether your child attends or not, unless your child is unwell and you have a medical certificate. Book casual days in OWNA up to <strong>14 days ahead</strong>.</p>", { icon: "star" })}
      ${card("Changing days", `<p>Email <a href="mailto:${ENROL_EMAIL}">${ENROL_EMAIL}</a> with your school name, your child's name and the day you need. Please give one week's notice. This is for regular bookings only.</p>`, { icon: "mail" })}
      ${card("Sick days", "<p>If your child is unwell, there is no charge when you provide a medical certificate, for regular and casual bookings alike. Please still mark them absent in OWNA.</p>", { icon: "heart" })}
    </div>

    <div class="owna">
      <div class="owna-head">
        <div>
          <div class="eyebrow dark">The OWNA app</div>
          <h3>Booking and managing in OWNA</h3>
        </div>
        <p>You will receive your OWNA login from our team. Keep it safe, because it opens both the Parent Portal and the OWNA app.</p>
      </div>
      ${steps(
        [
          ["Book attendances", "Tap the <b>+</b> button, choose Child(ren) Attendances, pick your dates and sessions, then confirm."],
          ["Mark an absence or delete a future booking", "Open the booking and mark it absent or delete it, or use <b>+</b> then Mark Child Not Attending. Recurring bookings need 7 days' notice and casual bookings cannot be cancelled."],
          ["Book several days at once", "Use multi-select on the Attendances screen."],
          ["Check your bookings", "Tap the Upcoming Attendances dropdown. You can also view past and absent attendances."],
          ["Update your details", "Tap the settings cog, then Manage My Details. You can also reset your password or PIN here. Health and medical changes must go through OWNA so our Health and Medical Team can review them."],
          ["View statements and invoices", "Open the menu, then Statements and Invoices. See the last 30 days or up to 24 months, and print any statement."],
        ],
        { cls: "grid2" },
      )}
    </div>
    <div class="more-owna">
      <h3>A few more things you can do in OWNA</h3>
      ${bullets([
        "See your child's daily information, including menu and sun protection updates, from the menu.",
        "Sign your child's incident reports, record medication and upload an immunisation record from the three dots on your child's profile.",
        "Sign your Complying Written Arrangement (CWA) when asked, from the same three dots menu.",
        "Set up or change your direct debit using the DDR form button on Statements and Invoices.",
        "Find our policies and centre information under Documents and Policies, at the bottom of the menu under Centre.",
      ])}
    </div>`,
  );
}

function handoverPage(c: WelcomePackCentre): string {
  return page(
    c,
    9,
    `    ${sectionHead(
      "Drop-off and pick-up",
      "Handing over safely, every session",
      "We use electronic sign-in on our iPad. A parent, carer or authorised adult must sign your child in and out. Children cannot sign themselves in or out, because it is a CCS requirement.",
    )}
    <ol class="signin">
      <li><span>1</span><strong>Come into the service</strong><em>Not the gate or car park</em></li>
      <li><span>2</span><strong>Sign in or out on the iPad</strong><em>A parent, carer or authorised adult</em></li>
      <li><span>3</span><strong>Hand over to an educator</strong><em>Every session, every child</em></li>
    </ol>
    <div class="${c.hasBsc ? "four" : "two"} fill">
      ${
        c.hasBsc
          ? card(
              "Before school drop-off",
              `<p>Walk your child to ${esc(c.dropOff)} (see the map on page 3), hand them to an educator and sign them in on the iPad. There are no gate drop-offs and no car park hand-offs.</p><p>When it is time, our educators walk the children to class and hand them to their teachers.</p>`,
              { icon: "sun" },
            )
          : ""
      }
      ${card(
        "After school pick-up",
        `<p>Children in ${firstYears(c)} are collected from their classrooms by our educators. Older children meet us at ${esc(c.dropOff)}.</p><p>Please come into the service, not the gate or car park, and sign your child out on the iPad before taking them home.</p>`,
        { icon: "hand" },
      )}
      ${card("Who can collect", "<p>You, and anyone you have authorised. To authorise someone else, email written permission to your service's email address. They will need to show photo ID at the service.</p>", { icon: "user" })}
      ${card("If your child does not arrive", "<p>Please mark them absent in OWNA. If your child is on the roll but does not arrive, we call you, then your emergency contacts, then police if we cannot confirm their safety.</p>", { icon: "alert", tone: "chiffon" })}
    </div>
    <a class="late" href="${tel(c.phone)}">
      ${icon("clock")}
      <div><strong>Running late?</strong>Please call your centre as soon as you know. After 6:30pm, late pick-up is $15 for every 15 minutes, per child.</div>
      <span class="num">${esc(c.phone)}</span>
    </a>`,
  );
}

function foodPage(c: WelcomePackCentre): string {
  return page(
    c,
    10,
    `${sectionHead("Food and health", "Halal, nut-free and safe")}
    <div class="two">
      <div class="card card-white feature">
        <img class="club" src="__PUBLIC__/amana-assets/club-fuel-up.svg" alt="Fuel Up with Amana"/>
        <p>Everything we serve is <strong>halal</strong>, and ${c.hasBsc ? "breakfast and afternoon tea are" : "afternoon tea is"} included every session. Menus are on display at the service and in the OWNA app.</p>
        <p>We are a <strong>nut-free service</strong>, so we do not provide nuts and please do not send any in your child's bag.</p>
      </div>
      ${card("Sun safety", "<p>Everyone wears a hat outdoors, and we have yellow Amana OSHC hats for anyone who forgets.</p><p>SPF 50+ sunscreen is available at every service. If your child has a sensitivity, please supply your own and tell the team.</p>", { icon: "sun", tone: "chiffon" })}
    </div>

    <div class="medical">
      <div class="medical-head">
        <div>
          <h3>Allergies and medical needs: what we need from you</h3>
          <p>Our Health and Medical Team reviews every child's medical information and may follow up with questions. Please allow <strong>up to two weeks</strong> for review before schedules are confirmed.</p>
        </div>
      </div>
      <div class="medical-body">
        <div>
          <h4>Please provide</h4>
          <ul class="checks">
            <li>A current letter of diagnosis from a medical practitioner</li>
            <li>Any required medication (such as an EpiPen, Ventolin or antihistamine), with permissions</li>
            <li>A coloured Action Plan signed and dated by a doctor, renewed every year</li>
            <li>A Risk Minimisation and Communication Plan, updated every year</li>
            <li>An Additional Clinical Support Plan, if we tell you one is needed</li>
          </ul>
        </div>
        <div class="medical-note">
          <p>Please keep these current. <strong>Children cannot attend if their medical requirements are not up to date</strong>, and we may end care if requested documentation is not supplied.</p>
          <p>This is purely about your child's safety. Everything you share is kept confidential.</p>
          <p class="hl-note">New diagnosis? Email us straight away, even before the paperwork is ready.</p>
        </div>
      </div>
    </div>`,
  );
}

function programsPage(c: WelcomePackCentre): string {
  const clubs: Array<[string, string, string]> = [
    ...(c.hasBsc
      ? ([["club-rise-shine.svg", "Rise and Shine Club", "Before school care that opens two hours before the bell and starts the day with energy, movement and a positive mindset."]] as Array<[string, string, string]>)
      : []),
    ["club-afternoons.svg", "Amana Afternoons", "Our after school care, from the final bell until 6:30pm."],
    ["club-homework.svg", "Homework Heroes", "Quiet, supported time to get homework done."],
    ["club-little-champions.svg", "Little Champions Club", "Sport and active play that burns off the day's energy."],
    ["club-imagination.svg", "Imagination Station", "Arts, crafts and STEM for curious minds."],
    ["club-iqra.svg", "Iqra Circle", "Quran recitation and Arabic learning in a nurturing, faith-centred space."],
    ["club-fuel-up.svg", "Fuel Up with Amana", "Halal food and cooking, with nutritious meals and snacks."],
    [
      "club-holiday-quest.svg",
      "Holiday Quest",
      'Vacation care in the school holidays, and on pupil-free days too. Open to all primary school aged children, 7:00am to 6:00pm. Locations rotate by demand. Details at <a href="https://amanaoshc.com.au/holiday-quest">amanaoshc.com.au/holiday-quest</a>.',
    ],
  ];
  return page(
    c,
    11,
    `${sectionHead("Our programs", "What your child will get up to", "Every session mixes learning, play, faith and food, so your child heads home happy, fed and with their homework done.")}
    <div class="clubs ${clubs.length % 2 ? "odd" : ""}">${clubs
      .map(
        ([img, t, b]) => `<div class="club-card">
          <div class="club-art"><img src="__PUBLIC__/amana-assets/${img}" alt=""/></div>
          <div><h3>${t}</h3><p>${b}</p></div>
        </div>`,
      )
      .join("")}</div>`,
    { cls: "programs" },
  );
}

function goodToKnowPage(c: WelcomePackCentre): string {
  return page(
    c,
    12,
    `${sectionHead("Good to know", "How we look after each other")}
    <div class="two">
      ${card("Devices and belongings", "<p>Phones, smart watches, tablets and laptops are not permitted unless used for homework. Please speak to your Service Coordinator about our BYOD policy.</p><p>Amana cannot be responsible for lost or stolen items, so please consider this when choosing what your child brings.</p>", { icon: "device" })}
      <div class="card card-white">
        <h3>Fair play</h3>
        <p>We ask every child to:</p>
        <ul class="pills">
          <li>Be respectful</li><li>Look after our space</li><li>Listen to our team</li>
          <li>Stay within view of an educator</li><li>Use kind language</li><li>Talk to us if something is worrying them</li>
        </ul>
        <p>Amana OSHC has zero tolerance for violence and aggression toward children or staff, and families may be called for early collection if unsafe behaviour continues.</p>
      </div>
    </div>

    ${card(
      "Excursions",
      "<p>During Holiday Quest we sometimes head out on excursions. We send you an excursion form before the day, with where we are going, how we will travel and what your child needs. <strong>Please sign and return it</strong>, because your child can only join an excursion with your written permission.</p>",
      { tone: "chiffon" },
    )}

    <div class="safety">
      <h2>Your child's safety comes first</h2>
      <div class="safety-grid">
        <div>${rays("sg-rays")}<p>Every team member holds a valid <strong>Working With Children Check</strong></p></div>
        <div>${rays("sg-rays")}<p>Every team member has completed <strong>Geccko child safety</strong> and <strong>food handling</strong> training</p></div>
        <div>${rays("sg-rays")}<p>Our senior team members hold current <strong>first aid</strong> training</p></div>
        <div>${rays("sg-rays")}<p>We employ our team directly, with <strong>no agency fill-ins</strong></p></div>
      </div>
      <p class="safety-foot">Children stay within an educator's eyesight at all times. Our policies, including our Medical Conditions Policy, are available on request, under Parent Resources on our website, and under Documents and Policies in OWNA.</p>
    </div>`,
  );
}

function touchPage(c: WelcomePackCentre, a: TemplateAssets): string {
  const reg = REGULATOR[c.state];
  return page(
    c,
    13,
    `${sectionHead("Staying in touch", "Email, WhatsApp, OWNA and feedback")}
    <div class="two">
      ${card(
        "Email",
        `<p>We write from <strong>${ENROL_EMAIL}</strong>, through OWNA broadcasts, and from your school's address, <strong>${esc(c.email)}</strong>.</p><p>Please save these so we do not end up in your spam.</p>`,
        { icon: "mail" },
      )}
      <div class="card card-green wa">
        <div>
          <h3>WhatsApp community</h3>
          <p>Join the Amana OSHC WhatsApp Community for general updates and announcements, including Holiday Quest news.</p>
          <a class="btn" href="${WHATSAPP_URL}">Join the community</a>
        </div>
        <img class="qr" src="${a.assetBase}/whatsapp-qr.png" alt="QR code to join the WhatsApp community"/>
      </div>
      ${card("Social media", "<p>Follow <strong>@AmanaOSHC</strong> on Facebook and Instagram for community moments, holiday program peeks and team highlights.</p>", { icon: "globe" })}
      ${card(
        "Raising a concern or giving feedback",
        `<p>We would love to hear from you. For any concern, question, help or enrolment change, email <a href="mailto:${ENROL_EMAIL}">${ENROL_EMAIL}</a> and our team will go through it. Please keep concerns out of the WhatsApp community so we can look after them properly.</p>`,
        { icon: "heart", tone: "chiffon" },
      )}
    </div>

    ${sectionHead("Who to contact", "We are always here to help")}
    <div class="contact-big">
      <a class="cb cb-centre" href="${tel(c.phone)}">
        <span class="k">While your child is in care</span>
        <span class="t">Call your service directly</span>
        <span class="num">${icon("phone")}${esc(c.phone)}</span>
      </a>
      <a class="cb cb-office" href="tel:${HEAD_OFFICE_TEL}">
        <span class="k">Questions, concerns, enrolment and after hours</span>
        <span class="t">Call head office or email us</span>
        <span class="num">${icon("phone")}${HEAD_OFFICE}</span>
        <span class="mail">${ENROL_EMAIL}</span>
      </a>
    </div>
    <p class="fine">We do not have a separate after hours line, so please call or email and we will respond as soon as we can.</p>
    <div class="regulator">
      <p><strong>Still not resolved?</strong> We always want to put things right ourselves first, but you can also contact the ${reg.name} on <strong>${reg.phone}</strong> or at ${reg.web}. They regulate every education and care service in ${c.state === "VIC" ? "Victoria" : "NSW"}.</p>
    </div>`,
  );
}

function faqs(c: WelcomePackCentre): Array<[string, string]> {
  return [
    ["What if my child is unwell?", "Please keep them home until they feel better, and mark them absent in OWNA. If you provide a medical certificate there is no charge, for regular and casual bookings alike. If your child becomes unwell while with us, we will contact you."],
    ["What time do you open and close?", `Amana Afternoons runs from the final bell until 6:30pm.${c.hasBsc ? " Rise and Shine Club opens two hours before the bell." : ""}`],
    [
      "What does a typical afternoon look like?",
      `Children arrive for roll call and a headcount, then enjoy a freshly prepared halal afternoon tea. Homework Heroes follows (Monday to Wednesday), then sport and active play with Little Champions Club, Iqra Circle and Asr prayer, and creative free play with Imagination Station before home time. Times are a guide and vary by centre.${c.hasBsc ? " Rise and Shine Club runs a morning version, with breakfast, calm play and a settled drop-off." : ""}`,
    ],
    ["When will I be charged?", "One week in arrears. Sessions your child attends in week one are charged on the Wednesday of week two, after CCS."],
    ["Do I pay if my child is away?", "Fees apply to booked sessions, including absences and public holidays in term time. If your child is sick and you provide a medical certificate, there is no charge."],
    ["Can I change my child's days?", `For regular bookings, yes. Email ${ENROL_EMAIL} with one week's notice. Casual sessions cannot be cancelled, and swaps and make-up sessions are not possible.`],
    ["Can I book a casual day?", "Yes. Tap the + button in the OWNA app, choose Child(ren) Attendances, pick your dates and confirm. Casual days can be booked up to 14 days ahead."],
    ["How do I pay?", "Weekly direct debit through OWNA, a one-off payment in the OWNA app, or direct deposit. The details are on page 7."],
    ["How do I set up my Child Care Subsidy?", `If you have not used CCS before, or your child has not been in approved care in the last 26 weeks, make a new claim with Centrelink first. Then, once we notify Centrelink, confirm the enrolment in myGov. See page 6, or call us on ${HEAD_OFFICE}.`],
    ["Is there a registration fee?", "No. There is no registration fee, enrolment fee or bond."],
    ["Who collects my child from class?", `Children in ${firstYears(c)} are collected from their classrooms by our educators. Older children meet us at the service location.`],
    ["Can someone else pick up my child?", "Yes. Email written authorisation to your service's email address. They must bring photo ID."],
    ["What if I am running late?", "Please call your service as soon as you know. After 6:30pm, late pick-up is $15 for every 15 minutes, per child."],
    ["Is the food halal and nut-free?", "All food is halal and we are a nut-free service. Please do not send nuts in your child's bag."],
    ["My child has an allergy or medical condition. What do I do?", "Add their medical plans to your enrolment in OWNA, or email your service. Our Health and Medical Team may take up to two weeks to review. Children cannot attend if their medical requirements are not up to date."],
    ["Can staff give my child medication?", "Only when it has been recorded properly. Please record any medication your child needs in OWNA, and speak to your service before sending any medication with your child."],
    ["Can my child bring a phone or tablet?", "No. Phones, smart watches, tablets and laptops are not permitted unless used for homework. Please speak to your Service Coordinator about our BYOD policy."],
    ["Does my child pray at Amana?", "Our Iqra Circle offers Quran recitation, Arabic learning and Asr prayer in a dedicated, nurturing space."],
    ["How do I update my details?", "In the OWNA app, tap the settings cog, then Manage My Details. Health and medical changes must go through OWNA so our Health and Medical Team can review them."],
    ["I have not received my OWNA login. What do I do?", `Please email ${ENROL_EMAIL} or call ${HEAD_OFFICE} and we will sort it out.`],
    ["Where can I read your policies?", "On request, under Parent Resources on our website, and under Documents and Policies in the OWNA app."],
    ["How do I raise a concern or give feedback?", `Email ${ENROL_EMAIL} and our team will go through it. Please keep concerns out of the WhatsApp community.`],
    ["Do you run vacation care and pupil-free days?", "Yes. Holiday Quest runs in the school holidays, and we also run care on pupil-free days. All primary school aged children are welcome, whether or not they attend Amana during term time."],
    ["How are photos and social media handled?", `Your photo and social media consent is recorded in your enrolment form, and we follow it. To change it, email ${ENROL_EMAIL}.`],
    ["How do I stop attending Amana?", `There is no lock-in. Simply cancel your recurring bookings, with one week's notice, by emailing ${ENROL_EMAIL}.`],
  ];
}

/** Only questions the rest of the pack doesn't already answer — the FAQ
 * used to repeat ~18 of its 25 answers from earlier pages. */
const FAQ_KEEP = new Set([
  "What if my child is unwell?",
  "What does a typical afternoon look like?",
  "Can staff give my child medication?",
  "Does my child pray at Amana?",
  "I have not received my OWNA login. What do I do?",
  "Do you run vacation care and pupil-free days?",
  "How are photos and social media handled?",
  "How do I stop attending Amana?",
]);

function faqPages(c: WelcomePackCentre): string {
  const items = faqs(c).filter(([q]) => FAQ_KEEP.has(q));
  return page(
    c,
    14,
    `${sectionHead("Quick answers", "Frequently asked questions")}<div class="faq">${items
      .map(([q, a]) => `<div class="qa"><h3><span class="q">Q</span>${q}</h3><p>${a}</p></div>`)
      .join("")}</div>`,
  );
}

function backCover(_c: WelcomePackCentre): string {
  return `<section class="page back">
    <div class="back-brand">
      <img class="back-logo" src="__ASSETS__/brand/logo-colour.svg" alt="Amana OSHC"/>
      <img class="back-lockup" src="__ASSETS__/brand/beyond-the-bell.png" alt="Beyond The Bell"/>
    </div>
  </section>`;
}

/* ------------------------------------------------------------------ */

export function renderWelcomePack(c: WelcomePackCentre, a: TemplateAssets): string {
  const body = [
    cover(c),
    welcomePage(c, a),
    findingUsPage(c, a),
    gettingStartedPage(c),
    feesPage(c),
    ccsPage(c),
    payPage(c),
    bookingPage(c),
    handoverPage(c),
    foodPage(c),
    programsPage(c),
    goodToKnowPage(c),
    touchPage(c, a),
    faqPages(c),
    backCover(c),
  ].join("\n");

  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8"/>
<title>Parent Welcome Pack: Amana OSHC ${esc(c.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=Fredoka:wght@500;600;700&display=block" rel="stylesheet"/>
<style>${CSS}</style>
</head>
<body>${body.replace(/__PUBLIC__/g, a.publicBase).replace(/__ASSETS__/g, a.assetBase)}</body>
</html>`;
}

const CSS = /* css */ `
:root {
  --green: #004E64;
  --green-deep: #003A4B;
  --jonquil: #FECE00;
  --chiffon: #FFF2BF;
  --latte: #FFFAE6;
  --ink: #0F3340;
  --muted: #4A6B76;
  --line: #E9DFB8;
  --white: #FFFFFF;
  --din: "DIN Condensed", "Barlow Condensed", sans-serif;
}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #ddd; }
body {
  font-family: "Barlow Condensed", "DIN Condensed", sans-serif;
  font-weight: 500;
  font-size: 10.6pt;
  line-height: 1.38;
  color: var(--ink);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
a { color: inherit; text-decoration: none; }
p a, li a, .fine a { color: var(--green); border-bottom: 1.5px solid var(--jonquil); font-weight: 600; }
strong, b { font-weight: 700; color: var(--green); }
h1, h2, h3, h4 { font-family: "Fredoka", "Somatic", sans-serif; color: var(--green); font-weight: 600; line-height: 1.15; }

/* ---------- page frame ---------- */
.page {
  width: 210mm; height: 297mm;
  position: relative; overflow: hidden;
  background: var(--latte);
  page-break-after: always; break-after: page;
  margin: 0 auto;
}
@media screen { .page { margin: 8mm auto; box-shadow: 0 2px 14px rgba(0,0,0,.18); } }
.page-body {
  position: absolute; inset: 15mm 15mm 19mm 15mm;
  overflow: hidden;
  display: flex; flex-direction: column; gap: 5mm;
}
/* Never let a block shrink to fit — build.ts must SEE an overflowing page. */
.page-body > * { flex-shrink: 0; }
.foot {
  position: absolute; left: 15mm; right: 15mm; bottom: 8mm;
  display: flex; justify-content: space-between; align-items: center;
  font-family: var(--din); font-size: 10pt; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 700;
  border-top: 1px solid var(--line); padding-top: 3mm;
}
.foot-l { display: flex; align-items: center; gap: 2.2mm; }
.foot-l img { height: 5mm; }
.foot-r { display: flex; align-items: center; gap: 3mm; }
.pg {
  display: inline-grid; place-items: center; width: 7mm; height: 7mm; border-radius: 50%;
  background: var(--jonquil); color: var(--green); font-family: "Fredoka"; font-size: 9pt; letter-spacing: 0;
}

/* ---------- headings ---------- */
.sec { display: flex; flex-direction: column; gap: 2mm; }
.sec-top { display: flex; justify-content: space-between; align-items: flex-end; gap: 6mm; border-bottom: 0.7mm solid var(--jonquil); padding-bottom: 2.4mm; }
.sec-no { font-family: "Fredoka"; font-weight: 600; font-size: 40pt; line-height: .8; color: var(--jonquil); }
.eyebrow {
  display: flex; align-items: center; gap: 1.6mm; margin-bottom: 1mm;
  font-family: var(--din); font-size: 11.5pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--muted);
}
.eyebrow.dark { color: var(--green); }
.eyebrow.light { color: var(--jonquil); }
h2 { font-size: 22pt; letter-spacing: -.005em; }
h3 { font-size: 12.5pt; }
h4 { font-size: 10.5pt; margin-top: 2mm; }
.lede { font-size: 11.6pt; color: var(--ink); max-width: 165mm; }
.lede .ico.inline { width: 4mm; height: 4mm; vertical-align: -0.7mm; color: var(--green); }
h3.sub { font-size: 14pt; margin-top: 1mm; }
p + p { margin-top: 1.6mm; }
.fine { font-size: 9pt; color: var(--muted); }
.mb { margin-top: -2.5mm; }

/* ---------- cards ---------- */
.card {
  border-radius: 4.5mm; padding: 4.6mm 5mm;
  display: flex; flex-direction: column; gap: 1.8mm;
}
.card h3 { display: block; }
.card-white { background: var(--white); box-shadow: 0 0.4mm 0 rgba(0,78,100,.06), 0 0 0 0.25mm rgba(0,78,100,.06); }
.card-chiffon { background: var(--chiffon); }
.card-green { background: var(--green); color: var(--latte); }
.card-green h3, .card-green strong { color: var(--white); }
.ico { width: 5.6mm; height: 5.6mm; flex: none; color: var(--green); }
.card h3 .ico {
  width: 7.4mm; height: 7.4mm; padding: 1.4mm; border-radius: 50%; background: var(--jonquil); color: var(--green);
}
.card-chiffon h3 .ico { background: var(--white); }
.ico.big { width: 9mm; height: 9mm; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
.two.tight { gap: 3.5mm; }
.three { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3.5mm; }
.four { display: grid; grid-template-columns: 1fr 1fr; gap: 3.5mm; }

/* ---------- lists ---------- */
.steps { list-style: none; display: flex; flex-direction: column; }
.steps li { display: flex; gap: 3mm; padding: 2.4mm 0; border-bottom: 1px solid var(--line); }
.steps li:last-child { border-bottom: 0; }
.steps .badge {
  flex: none; width: 6.6mm; height: 6.6mm; border-radius: 50%;
  display: grid; place-items: center; background: var(--jonquil); color: var(--green);
  font-family: "Fredoka"; font-weight: 600; font-size: 10pt;
}
.steps strong { font-family: "Fredoka"; font-weight: 600; font-size: 11pt; display: block; margin-bottom: .4mm; }
.steps.compact li { padding: 1.7mm 0; }
.steps.compact strong { font-size: 10.4pt; }
.steps.grid2 { display: grid; grid-template-columns: 1fr 1fr; column-gap: 6mm; }
.steps.grid2 li:nth-last-child(2) { border-bottom: 0; }
.bullets { list-style: none; display: flex; flex-direction: column; gap: 1.2mm; }
.bullets li { padding-left: 5mm; position: relative; }
.bullets li::before {
  content: ""; position: absolute; left: 0; top: 1.6mm; width: 3.4mm; height: 1.75mm; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='40 133 37.5 19'%3E%3Cpath fill='%23FECE00' d='M72.6534 133.188C75.2024 133.188 77.1206 135.596 76.4451 138.05C74.3102 145.85 67.1729 151.579 58.6973 151.579C50.2217 151.579 43.0844 145.844 40.9496 138.05C40.2804 135.596 42.1986 133.188 44.7413 133.188H72.647H72.6534Z'/%3E%3C/svg%3E") no-repeat center / contain;
}
.checks { list-style: none; display: flex; flex-direction: column; gap: 1.6mm; }
.checks li { padding-left: 6.5mm; position: relative; }
.checks li::before {
  content: "✓"; position: absolute; left: 0; top: .1mm; width: 4.4mm; height: 4.4mm; border-radius: 1.2mm;
  background: var(--green); color: var(--jonquil); font-size: 8pt; font-weight: 700; display: grid; place-items: center;
}

/* ---------- cover (after the guideline cover) ---------- */
.cover { background: var(--green); }
.cv-burst { position: absolute; color: var(--jonquil); }
.cv-b1 { width: 120mm; top: -58mm; right: 6mm; }
.cv-b2 { width: 104mm; top: 112mm; left: -64mm; }
.cv-b3 { width: 150mm; bottom: -62mm; right: -58mm; transform: rotate(-18deg); }
.cover-main { position: absolute; top: 96mm; left: 0; right: 0; display: flex; flex-direction: column; align-items: center; text-align: center; }
.cover-logo { width: 118mm; }
.cover-tag { margin-top: 14mm; font-family: var(--din); font-weight: 700; font-size: 17pt; letter-spacing: .14em; text-transform: uppercase; color: var(--jonquil); }
.cover-centre { margin-top: 4mm; display: flex; flex-direction: column; gap: 1.6mm; color: var(--latte); }
.cover-centre-v { font-family: "Fredoka"; font-weight: 600; font-size: 24pt; line-height: 1.1; }
.cover-centre-a { font-size: 12pt; opacity: .85; }
.cover-btb { position: absolute; left: 16mm; bottom: 14mm; font-family: "Fredoka"; font-weight: 600; font-size: 14pt; color: var(--latte); }

/* ---------- welcome ---------- */
.welcome-grid { display: grid; grid-template-columns: 1.25fr 1fr; gap: 7mm; align-items: start; }
.letter { display: flex; flex-direction: column; gap: 3mm; }
.letter .big { font-family: "Fredoka"; font-size: 14pt; color: var(--green); font-weight: 500; }
.letter p { font-size: 11.4pt; }
.sign { margin-top: 1mm; }
.lockup { width: 34mm; align-self: flex-start; margin: 3mm 0 1mm 4mm; }
.glance { margin-top: 2mm; background: var(--white); border-radius: 4.5mm; padding: 4.5mm 5mm; display: flex; flex-direction: column; gap: 2.4mm; }
.glance h3 { font-size: 12pt; }
.glance-row { display: grid; grid-template-columns: 28mm 1fr; gap: 2mm; align-items: center; padding-top: 2.4mm; border-top: 1px solid var(--line); }
.glance-row .k { font-weight: 700; text-transform: uppercase; letter-spacing: .06em; font-size: 10.5pt; color: var(--muted); font-family: var(--din); }
.glance-row .v { font-weight: 600; }
.contents {
  align-self: start; display: flex; flex-direction: column;
  position: relative; background: var(--green); color: var(--latte); border-radius: 5mm; padding: 7mm 6mm; overflow: hidden;
}
.contents h3 { color: var(--jonquil); font-size: 15pt; margin-bottom: 4mm; position: relative; }
.contents ol { list-style: none; display: flex; flex-direction: column; position: relative; }
.contents li { display: flex; justify-content: space-between; align-items: center; gap: 3mm; padding: 2.5mm 0; border-bottom: 1px solid rgba(255,250,230,.16); }
.contents li:last-child { border-bottom: 0; }
.ct { display: flex; flex-direction: column; }
.ct strong { color: var(--white); font-family: "Fredoka"; font-weight: 500; font-size: 11pt; }
.ct em { font-style: normal; font-size: 9.4pt; color: rgba(255,250,230,.72); }
.cp { font-family: "Fredoka"; color: var(--jonquil); font-size: 12pt; }

/* ---------- finding us ---------- */
.find { display: grid; grid-template-columns: auto 1fr; gap: 6mm; align-items: start; }
.map { margin: 0; }
.map img { display: block; max-height: 206mm; max-width: 116mm; width: auto; height: auto; border-radius: 4mm; border: 1.2mm solid var(--white); box-shadow: 0 0 0 0.25mm rgba(0,78,100,.14); }
.find-aside { display: flex; flex-direction: column; gap: 4mm; min-width: 52mm; }
.where { background: var(--green); color: var(--latte); border-radius: 5mm; padding: 5mm; }
.where .k { display: block; font-family: var(--din); font-size: 11pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--jonquil); }
.where .v { display: block; font-family: "Fredoka"; font-weight: 600; font-size: 22pt; color: var(--white); margin: 1mm 0 2mm; line-height: 1.1; }
.where p { font-size: 10.6pt; }
.wed { margin-top: 2.6mm; background: rgba(254,206,0,.16); border-left: 1mm solid var(--jonquil); padding: 2mm 3mm; border-radius: 0 2mm 2mm 0; }
.wed strong { color: var(--jonquil); }
.legend { background: var(--white); border-radius: 4.5mm; padding: 4.5mm; display: flex; flex-direction: column; gap: 2.6mm; }
.legend h3 { font-size: 12pt; }
.legend > div { display: grid; grid-template-columns: 7mm 1fr; align-items: center; gap: 2mm; }
.legend span { display: flex; flex-direction: column; font-size: 10.4pt; line-height: 1.2; }
.legend strong { font-family: "Fredoka"; font-weight: 600; }
.key { display: block; justify-self: center; }
.key-pin { width: 4.4mm; height: 4.4mm; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: #E2312B; }
.key-line { width: 6.5mm; height: 2mm; border-radius: 1mm; background: var(--jonquil); }
.key-star { width: 5mm; height: 5mm; background: #F2A900; clip-path: polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%); }
.coord { margin-top: 3mm; background: var(--white); border-radius: 5mm; padding: 5mm; display: grid; grid-template-columns: 24mm 1fr; column-gap: 4mm; row-gap: 3.5mm; align-items: center; }
.coord .avatar { width: 24mm; height: 24mm; border-radius: 50%; object-fit: cover; border: 1mm solid var(--jonquil); }
.avatar-i { display: grid; place-items: center; background: var(--chiffon); font-family: "Fredoka"; font-size: 18pt; color: var(--green); }
.coord .k { display: block; font-family: var(--din); font-size: 10.5pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.coord .name { display: block; font-family: "Fredoka"; font-weight: 600; font-size: 17pt; color: var(--green); line-height: 1.15; }
.coord-who p { font-size: 10pt; color: var(--muted); }
.coord-contact { grid-column: span 2; display: grid; gap: 2.4mm; border-top: 1px solid var(--line); padding-top: 3mm; }
.coord-contact .v { display: block; font-weight: 700; color: var(--green); font-size: 11.5pt; }
.coord-contact .v.big { font-family: "Fredoka"; font-size: 17pt; font-weight: 600; }
.tile { display: grid; grid-template-columns: 9mm 1fr; column-gap: 3mm; align-items: center; background: var(--chiffon); border-radius: 4mm; padding: 3.6mm 4.4mm; }
.tile .ico { grid-row: span 2; width: 9mm; height: 9mm; padding: 2mm; background: var(--jonquil); border-radius: 50%; }
.tile .k { color: var(--muted); }
.tile .v { font-weight: 700; color: var(--green); font-size: 11.5pt; word-break: break-all; }
.tile .v.big { font-family: "Fredoka"; font-size: 17pt; font-weight: 600; }
.hours { display: grid; gap: 2mm; background: var(--white); border-radius: 4mm; padding: 3.6mm 4.4mm; }
.hours > div { display: flex; justify-content: space-between; align-items: center; gap: 3mm; }
.hours > div + div { border-top: 1px solid var(--line); padding-top: 2mm; }
.hours .k { display: flex; align-items: center; gap: 1.6mm; font-family: var(--din); font-size: 10.5pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.hours .k .ico { width: 4.6mm; height: 4.6mm; }
.hours .v { font-weight: 700; color: var(--green); }
.find-aside .spot { display: block; }
.spot { display: flex; gap: 3mm; align-items: flex-start; font-size: 10pt; color: var(--muted); padding: 0 1mm; }
.spot .ico { color: var(--green); }

/* ---------- getting started ---------- */
.timeline { list-style: none; display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; position: relative; margin-top: 2mm; }
.timeline::before { content: ""; position: absolute; top: 6mm; left: 8%; right: 8%; height: 0.8mm; background: repeating-linear-gradient(90deg, var(--jonquil) 0 3mm, transparent 3mm 5mm); }
.timeline li { position: relative; background: var(--white); border-radius: 4.5mm; padding: 15mm 4mm 4.5mm; display: flex; flex-direction: column; gap: 1.4mm; margin-top: 0; }
.tl-num {
  position: absolute; top: -1mm; left: 4mm; width: 13mm; height: 13mm; border-radius: 50%;
  background: var(--green); color: var(--jonquil); font-family: "Fredoka"; font-weight: 600; font-size: 17pt; display: grid; place-items: center;
  border: 1.2mm solid var(--latte);
}
.timeline strong { font-family: "Fredoka"; font-weight: 600; font-size: 12pt; }
.timeline p { font-size: 10pt; }
.first-day { background: var(--chiffon); border-radius: 6mm; padding: 7mm 6mm 6mm; display: flex; flex-direction: column; gap: 4mm; position: relative; overflow: hidden; }
.first-day-head { position: relative; }
.fd-items { display: flex; flex-direction: column; gap: 3mm; }
.fd { background: var(--white); border-radius: 4.5mm; padding: 4.5mm 5mm 4.5mm 15mm; position: relative; display: flex; flex-direction: column; gap: 1.2mm; }
.fd .badge { position: absolute; left: 5mm; top: 4.6mm; width: 6.6mm; height: 6.6mm; border-radius: 50%; display: grid; place-items: center; background: var(--jonquil); color: var(--green); font-family: "Fredoka"; font-weight: 600; font-size: 10pt; }
.h3size { font-size: 16pt; }
.fd p { font-size: 10.8pt; }
.fd h3 { font-size: 12.5pt; }

/* ---------- fees ---------- */
.callout { display: flex; gap: 3.5mm; align-items: flex-start; background: var(--white); border-left: 1.6mm solid var(--jonquil); border-radius: 0 4mm 4mm 0; padding: 4mm 5mm; }
.callout .ico { margin-top: .4mm; }
.receipt { background: var(--white); border-radius: 5mm; padding: 5.5mm; display: flex; flex-direction: column; gap: 3mm; position: relative; }
.receipt-head p { margin-top: 1.4mm; font-size: 11pt; }
.receipt-rows { border-top: 0.5mm dashed var(--line); }
.r { display: flex; justify-content: space-between; align-items: center; padding: 2.4mm 0; border-bottom: 0.5mm dashed var(--line); font-size: 11pt; }
.r span:last-child { font-weight: 700; font-variant-numeric: tabular-nums; }
.r.minus span:last-child { color: #2E7D5B; }
.r.total { border-bottom: 0; padding-top: 3mm; }
.r.total span:first-child { font-weight: 700; color: var(--green); }
.r.total span:last-child { font-family: "Fredoka"; font-size: 24pt; color: var(--green); background: var(--jonquil); padding: 1mm 3mm; border-radius: 2.5mm; }
.gap-explain { background: var(--white); border-radius: 5mm; padding: 5.5mm; display: flex; flex-direction: column; gap: 2.4mm; }

/* ---------- ccs ---------- */
.ccs-steps { display: grid; grid-template-columns: 1.15fr 1fr; gap: 4mm; }
.ccs { border-radius: 5mm; padding: 5mm; display: flex; flex-direction: column; gap: 2mm; }
.ccs-1 { background: var(--white); }
.ccs-2 { background: var(--green); color: var(--latte); }
.ccs-2 h3, .ccs-2 strong { color: var(--white); }
.ccs-tag { align-self: flex-start; background: var(--jonquil); color: var(--green); border-radius: 99mm; padding: .8mm 3mm; font-family: var(--din); font-size: 10.5pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.ccs-1 .ccs-tag { background: var(--chiffon); }
.help { margin-top: auto; display: flex; gap: 3mm; background: rgba(255,250,230,.1); border-radius: 3.5mm; padding: 3.5mm; }
.help .ico { color: var(--jonquil); }
.help a { color: var(--jonquil); border-color: var(--jonquil); }
table.fees { width: 100%; border-collapse: separate; border-spacing: 0; background: var(--white); border-radius: 4.5mm; overflow: hidden; font-size: 11pt; }
.fees th { text-align: left; background: var(--green); color: var(--latte); font-weight: 700; font-family: var(--din); font-size: 11pt; letter-spacing: .08em; text-transform: uppercase; padding: 3mm 4mm; }
.fees td { padding: 3.2mm 4mm; border-top: 1px solid var(--line); font-variant-numeric: tabular-nums; }
.fees td strong { display: block; font-family: "Fredoka"; font-weight: 600; }
.fees td em { font-style: normal; font-size: 9.4pt; color: var(--muted); }
.fees th.hl { background: var(--jonquil); color: var(--green); }
.fees td.hl { background: var(--chiffon); font-family: "Fredoka"; font-weight: 600; color: var(--green); font-size: 14pt; }

/* ---------- pay ---------- */
.pay-grid { display: grid; grid-template-columns: 1.1fr 1fr 1fr; gap: 3.5mm; }
.pay { background: var(--white); border-radius: 5mm; padding: 11mm 4.6mm 4.6mm; position: relative; display: flex; flex-direction: column; gap: 1.8mm; }
.pay-n { position: absolute; top: 4mm; left: 4.6mm; font-family: "Fredoka"; font-weight: 600; font-size: 10pt; color: var(--green); background: var(--jonquil); border-radius: 99mm; padding: .4mm 2.8mm; }
.pay h3 { font-size: 11.6pt; }
.pay p { font-size: 10pt; }
dl.charges, dl.bank { display: grid; grid-template-columns: auto 1fr; gap: .9mm 3mm; font-size: 9.8pt; }
dl dt { color: var(--muted); }
dl dd { font-weight: 700; color: var(--green); text-align: right; }
dl.bank dd { font-family: "Fredoka"; font-weight: 600; }
.invoice { background: var(--white); border-radius: 5mm; padding: 5mm; display: flex; flex-direction: column; gap: 3mm; }
.invoice-head p { font-size: 10.2pt; color: var(--muted); margin-top: .8mm; }
.invoice-body { display: grid; grid-template-columns: 40mm 1fr; gap: 5mm; }

/* ---------- booking ---------- */
.owna { background: var(--white); border-radius: 5mm; padding: 4.6mm 5mm; display: flex; flex-direction: column; gap: 3mm; }
.owna-head { display: grid; grid-template-columns: 1fr 1.1fr; gap: 5mm; align-items: end; padding-bottom: 3mm; border-bottom: 0.6mm solid var(--jonquil); }
.owna-head h3 { font-size: 15pt; margin-top: 1mm; }
.owna-head p { font-size: 10.2pt; color: var(--muted); }
.steps.grid2 p { font-size: 9.8pt; }
.owna .steps li { padding: 1.8mm 0; }
.signin { list-style: none; display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; counter-reset: s; }
.signin li { background: var(--green); color: var(--latte); border-radius: 4.5mm; padding: 4.5mm; display: flex; flex-direction: column; gap: 1mm; position: relative; }
.signin li span { width: 9mm; height: 9mm; border-radius: 50%; background: var(--jonquil); color: var(--green); font-family: "Fredoka"; font-weight: 600; font-size: 13pt; display: grid; place-items: center; margin-bottom: 1.5mm; }
.signin li span .ico { width: 6mm; height: 6mm; }
.signin strong { color: var(--white); font-family: "Fredoka"; font-weight: 600; font-size: 12pt; }
.signin em { font-style: normal; font-size: 10pt; color: rgba(255,250,230,.8); }
.fill > .card:last-child:nth-child(odd) { grid-column: span 2; }
.late { margin-top: 2mm; display: flex; align-items: center; gap: 4mm; background: var(--jonquil); color: var(--green); border-radius: 5mm; padding: 5mm 6mm; }
.late .ico { width: 10mm; height: 10mm; }
.late div { flex: 1; }
.late strong { font-family: "Fredoka"; font-size: 14pt; display: block; }
.late .num { font-family: "Fredoka"; font-weight: 600; font-size: 22pt; }
.fill .card { padding: 6mm; gap: 2.6mm; }
.fill .card p { font-size: 11.6pt; }
.fill .card h3 { font-size: 14pt; }
.more-owna { background: var(--chiffon); border-radius: 5mm; padding: 4mm 5mm; display: flex; flex-direction: column; gap: 1.8mm; }
.more-owna .bullets { gap: .6mm; font-size: 10pt; }
.more-owna h3 { display: flex; align-items: center; gap: 2mm; }
.more-owna .bullets li::before { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='40 133 37.5 19'%3E%3Cpath fill='%23004E64' d='M72.6534 133.188C75.2024 133.188 77.1206 135.596 76.4451 138.05C74.3102 145.85 67.1729 151.579 58.6973 151.579C50.2217 151.579 43.0844 145.844 40.9496 138.05C40.2804 135.596 42.1986 133.188 44.7413 133.188H72.647H72.6534Z'/%3E%3C/svg%3E"); }

/* ---------- food ---------- */
.feature .club { height: 20mm; align-self: flex-start; margin-bottom: 1mm; }
.medical { background: var(--green); color: var(--latte); border-radius: 6mm; padding: 6mm; display: flex; flex-direction: column; gap: 4mm; }
.medical h3, .medical h4, .medical strong { color: var(--white); }
.medical h3 { font-size: 15pt; }
.medical-head { display: flex; gap: 4mm; align-items: flex-start; }
.medical-head .ico { color: var(--jonquil); flex: none; }
.medical-head p { margin-top: 1.4mm; }
.medical-body { display: grid; grid-template-columns: 1.15fr 1fr; gap: 6mm; }
.medical h4 { margin: 0 0 2.4mm; color: var(--jonquil); font-size: 11pt; }
.medical .checks li::before { background: var(--jonquil); color: var(--green); }
.medical-note { background: rgba(255,250,230,.08); border-radius: 4mm; padding: 4.5mm; }
.hl-note { background: var(--jonquil); color: var(--green); font-weight: 700; border-radius: 2.5mm; padding: 2.4mm 3mm; margin-top: 3mm !important; }

/* ---------- programs ---------- */
.clubs { display: grid; grid-template-columns: 1fr 1fr; gap: 3.5mm; }
.club-card { background: var(--white); border-radius: 5mm; padding: 4mm; display: grid; grid-template-columns: 34mm 1fr; gap: 4mm; align-items: center; }
.club-art { height: 26mm; display: grid; place-items: center; background: var(--latte); border-radius: 3.5mm; padding: 2.4mm; }
.club-art img { max-width: 100%; max-height: 100%; }
.club-card h3 { font-size: 12.4pt; margin-bottom: .8mm; }
.club-card p { font-size: 10pt; }
.clubs.odd .club-card:last-child { grid-column: span 2; grid-template-columns: 34mm 1fr; background: var(--green); color: var(--latte); }
.clubs.odd .club-card:last-child h3 { color: var(--jonquil); }
.clubs.odd .club-card:last-child a { color: var(--white); }
.clubs.odd .club-card:last-child .club-art { background: var(--latte); }

/* ---------- good to know ---------- */
.regulator { background: var(--white); border-left: 1.6mm solid var(--green); border-radius: 0 4mm 4mm 0; padding: 3.6mm 4.6mm; font-size: 10.4pt; }
.pills { list-style: none; display: flex; flex-wrap: wrap; gap: 1.4mm; }
.pills li { background: var(--chiffon); color: var(--green); font-weight: 600; border-radius: 99mm; padding: .7mm 2.8mm; font-size: 9.8pt; }
.safety { position: relative; overflow: hidden; background: var(--green); color: var(--latte); border-radius: 5mm; padding: 5mm 5mm 4.5mm; display: flex; flex-direction: column; gap: 2.4mm; }
.safety h2 { color: var(--white); position: relative; font-size: 16pt; }
.safety-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2.4mm; margin-top: 0; position: relative; }
.safety-grid > div { background: rgba(255,250,230,.09); border-radius: 3.5mm; padding: 2.6mm 3.4mm; display: flex; gap: 3mm; align-items: center; font-size: 11pt; }
.sg-rays { flex: none; width: 10mm; color: var(--jonquil); }
.safety-grid strong { color: var(--jonquil); }
.safety-foot { margin-top: 0; font-size: 9.6pt; color: rgba(255,250,230,.85); }

/* ---------- staying in touch ---------- */
.wa { display: grid; grid-template-columns: 1fr 25mm; gap: 3mm; align-items: center; }
.wa > div { display: flex; flex-direction: column; gap: 1.8mm; }
.btn { align-self: flex-start; background: var(--jonquil); color: var(--green); font-weight: 700; border-radius: 99mm; padding: 1.4mm 4mm; font-size: 10pt; margin-top: 1mm; }
.qr { width: 25mm; height: 25mm; background: var(--white); padding: 1.6mm; border-radius: 2.5mm; image-rendering: pixelated; }
.contact-big { display: grid; grid-template-columns: 1fr 1.2fr; gap: 4mm; }
.cb { border-radius: 5mm; padding: 5mm; display: flex; flex-direction: column; gap: 1mm; }
.cb .k { font-family: var(--din); font-size: 10.5pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.cb .t { font-family: "Fredoka"; font-weight: 500; font-size: 12pt; }
.cb .num { display: flex; align-items: center; gap: 2.4mm; font-family: "Fredoka"; font-weight: 600; font-size: 22pt; margin-top: 1.4mm; }
.cb .num .ico { width: 7mm; height: 7mm; }
.cb .mail { font-weight: 700; font-size: 11pt; }
.cb-centre { background: var(--jonquil); color: var(--green); }
.cb-centre .ico { color: var(--green); }
.cb-office { background: var(--green); color: var(--latte); }
.cb-office .k, .cb-office .ico { color: var(--jonquil); }
.cb-office .num { color: var(--white); }

/* ---------- faq ---------- */
.faq { column-count: 2; column-gap: 6mm; }
.qa { break-inside: avoid; background: var(--white); border-radius: 4mm; padding: 3.6mm 4.2mm; margin-bottom: 3.2mm; }
.qa h3 { font-size: 11pt; display: flex; gap: 2mm; align-items: flex-start; margin-bottom: 1.2mm; }
.qa .q { flex: none; width: 5.4mm; height: 5.4mm; border-radius: 50%; background: var(--jonquil); color: var(--green); font-size: 8.5pt; display: grid; place-items: center; margin-top: .1mm; }
.qa p { font-size: 10pt; }

/* ---------- back cover ---------- */
.back { background: var(--latte); }
.back-brand { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22mm; }
.back-logo { width: 120mm; }
.back-lockup { width: 44mm; }
.back-main { position: absolute; top: 182mm; left: 20mm; right: 20mm; display: flex; flex-direction: column; align-items: center; text-align: center; }
.thanks { font-family: "Fredoka"; font-weight: 600; font-size: 30pt; color: var(--green); }
.thanks-sub { font-size: 13pt; margin-top: 2mm; max-width: 130mm; }
.back-contacts { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; margin-top: 10mm; width: 100%; }
.back-contacts > div { background: var(--white); border-radius: 5mm; padding: 5mm; display: flex; flex-direction: column; gap: 1mm; }
.back-contacts .k { font-family: var(--din); font-size: 11pt; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; color: var(--muted); }
.back-contacts .v { font-family: "Fredoka"; font-weight: 600; font-size: 20pt; color: var(--green); }
.back-contacts .s { font-size: 11pt; }
.back-foot { position: absolute; left: 0; right: 0; bottom: 0; height: 22mm; background: var(--green); display: grid; place-items: center; color: var(--latte); font-family: var(--din); font-size: 12pt; letter-spacing: .06em; }
`;
