/**
 * Monthly Muslim/Islamic schools rescan — import script.
 * Adds new schools as CRM leads (source=community_connection, stage=new_lead).
 * Safe to run multiple times — deduplicates by schoolName+suburb against existing Lead records.
 *
 * Usage:  npx tsx scripts/import-muslim-schools.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type School = {
  schoolName: string;
  suburb: string;
  state: "NSW" | "VIC" | "QLD" | "WA" | "SA" | "ACT" | "NT" | "TAS";
  address?: string;
  postcode?: string;
  contactPhone?: string;
  contactEmail?: string;
  contactName?: string;
  website?: string;
};

const schools: School[] = [
  // ── NSW ─────────────────────────────────────────────────────────────
  {
    schoolName: "Malek Fahd Islamic School — Greenacre Primary Campus",
    suburb: "Greenacre",
    state: "NSW",
    address: "405 Waterloo Rd",
    postcode: "2190",
    website: "https://mfis.nsw.edu.au",
  },
  {
    schoolName: "Malek Fahd Islamic School — Greenacre Secondary Campus",
    suburb: "Greenacre",
    state: "NSW",
    address: "405 Waterloo Rd",
    postcode: "2190",
    website: "https://mfis.nsw.edu.au",
  },
  {
    schoolName: "Malek Fahd Islamic School — Hoxton Park Campus",
    suburb: "Hoxton Park",
    state: "NSW",
    address: "210 Pacific Palms Cct",
    postcode: "2171",
    contactPhone: "02 8783 5190",
    website: "https://mfis.nsw.edu.au",
  },
  {
    schoolName: "Malek Fahd Islamic School — Beaumont Hills Campus",
    suburb: "Beaumont Hills",
    state: "NSW",
    address: "20 Mungerie Rd",
    postcode: "2155",
    website: "https://mfis.nsw.edu.au",
  },
  {
    schoolName: "Al Noori Muslim School — Primary Campus",
    suburb: "Greenacre",
    state: "NSW",
    address: "75 Greenacre Rd",
    postcode: "2190",
    contactPhone: "+61 2 8774 3000",
  },
  {
    schoolName: "Al Noori Muslim School — Senior Campus",
    suburb: "Greenacre",
    state: "NSW",
    address: "89 Greenacre Rd",
    postcode: "2190",
  },
  {
    schoolName: "Muslim Girls Grammar School",
    suburb: "Granville",
    state: "NSW",
    address: "68 South Street",
    postcode: "2142",
    contactPhone: "+61 2 8111 5600",
    contactEmail: "info@mggs.nsw.edu.au",
    website: "https://mggs.nsw.edu.au",
  },
  {
    schoolName: "Al Zahra College",
    suburb: "Arncliffe",
    state: "NSW",
    address: "3-5 Wollongong Rd",
    postcode: "2205",
    contactPhone: "02 9599 0161",
    contactEmail: "info@azc.nsw.edu.au",
    contactName: "Dr Ken Darvall",
    website: "https://azc.nsw.edu.au",
  },
  {
    schoolName: "Arkana College",
    suburb: "Kingsgrove",
    state: "NSW",
    address: "346 Stoney Creek Rd",
    postcode: "2208",
    contactPhone: "02 9502 3655",
  },
  {
    schoolName: "Al-Faisal College — Auburn Campus",
    suburb: "Auburn",
    state: "NSW",
    address: "149 Auburn Rd",
    postcode: "2144",
    contactName: "Mrs Safia Khan Hassanein",
    website: "https://afc.nsw.edu.au",
  },
  {
    schoolName: "Al-Faisal College — Campbelltown Campus",
    suburb: "Minto",
    state: "NSW",
    address: "10 Benham Rd",
    postcode: "2566",
    website: "https://afc.nsw.edu.au",
  },
  {
    schoolName: "Al-Faisal College — Liverpool Campus",
    suburb: "Austral",
    state: "NSW",
    address: "121 Gurner Ave",
    postcode: "2179",
    website: "https://afc.nsw.edu.au",
  },
  {
    schoolName: "Al-Faisal College — Lakemba Campus",
    suburb: "Lakemba",
    state: "NSW",
    address: "69 Croydon Street",
    postcode: "2195",
    contactPhone: "1800 000 149",
    contactEmail: "lakemba@afc.nsw.edu.au",
    website: "https://afc.nsw.edu.au",
  },
  {
    schoolName: "Australian Islamic College of Sydney",
    suburb: "Mount Druitt",
    state: "NSW",
    address: "33 Headcorn Street",
    postcode: "2770",
  },
  {
    schoolName: "Al Hikma College",
    suburb: "Lakemba",
    state: "NSW",
    address: "291 Haldon Street",
    postcode: "2195",
  },
  {
    schoolName: "Al Amanah College — Bankstown Campus",
    suburb: "Bankstown",
    state: "NSW",
    address: "2 Winspear Ave",
    postcode: "2200",
  },
  {
    schoolName: "Al Amanah College — Liverpool Campus",
    suburb: "Liverpool",
    state: "NSW",
    address: "55 Speed Street",
    postcode: "2170",
    contactPhone: "02 9822 8022",
  },
  {
    schoolName: "Minarah College",
    suburb: "Green Valley",
    state: "NSW",
    address: "264 Wilson Rd",
    postcode: "2168",
  },
  {
    schoolName: "New Madinah College",
    suburb: "Young",
    state: "NSW",
    address: "14/16 Lachlan St",
    postcode: "2594",
    contactName: "Sheikh Abdulghani Albaf",
  },
  {
    schoolName: "Australian International Academy — Strathfield Campus",
    suburb: "Strathfield South",
    state: "NSW",
    address: "420 Liverpool Rd",
    postcode: "2136",
    website: "https://aia.edu.au",
  },
  {
    schoolName: "Australian International Academy — Kellyville Campus",
    suburb: "North Kellyville",
    state: "NSW",
    address: "2 Foxall Rd",
    postcode: "2155",
    contactPhone: "+61 2 8801 3100",
    website: "https://aia.edu.au",
  },
  {
    schoolName: "Unity Grammar",
    suburb: "Austral",
    state: "NSW",
    address: "70 Fourth Ave",
    postcode: "2179",
    contactName: "Sam Halbouni",
  },

  // ── VIC ─────────────────────────────────────────────────────────────
  {
    schoolName: "Al Siraat College",
    suburb: "Epping",
    state: "VIC",
    address: "45 Harvest Home Rd",
    postcode: "3076",
    contactPhone: "+61 3 9407 7000",
    contactEmail: "info@alsiraat.vic.edu.au",
    contactName: "Fazeel Arain",
    website: "https://alsiraat.vic.edu.au",
  },
  {
    schoolName: "Al-Taqwa College",
    suburb: "Truganina",
    state: "VIC",
    address: "201 Sayers Rd",
    postcode: "3029",
    contactPhone: "03 9269 5000",
    contactName: "Omar Hallak",
    website: "https://altaqwa.vic.edu.au",
  },
  {
    schoolName: "Islamic College of Melbourne",
    suburb: "Tarneit",
    state: "VIC",
    address: "83 Wootten Rd",
    postcode: "3029",
    contactPhone: "03 8742 1739",
    contactName: "Dr Abdul M. Kamareddine",
  },
  {
    schoolName: "Australian Islamic Centre College",
    suburb: "Newport",
    state: "VIC",
    address: "23-27 Blenheim Rd",
    postcode: "3015",
    website: "https://aicc.vic.edu.au",
  },
  {
    schoolName: "Al Iman College",
    suburb: "Melton South",
    state: "VIC",
    address: "20-40 Rees Rd",
    postcode: "3338",
  },
  {
    schoolName: "Muhammadiyah Australia College",
    suburb: "Melton",
    state: "VIC",
    address: "1-3 Killarney Dr",
    postcode: "3337",
  },
  {
    schoolName: "Ilim College — Dallas Primary Campus",
    suburb: "Dallas",
    state: "VIC",
    address: "2-16 Hazel Dr",
    postcode: "3047",
    website: "https://ilimcollege.vic.edu.au",
  },
  {
    schoolName: "Ilim College — Dallas Secondary Girls Campus",
    suburb: "Dallas",
    state: "VIC",
    address: "30 Inverloch Cres",
    postcode: "3047",
    contactPhone: "03 7073 3587",
    website: "https://ilimcollege.vic.edu.au",
  },
  {
    schoolName: "Ilim College — Kiewa Secondary Boys Campus",
    suburb: "Dallas",
    state: "VIC",
    address: "26-44 Kiewa Cres",
    postcode: "3047",
    contactPhone: "03 9302 1150",
    website: "https://ilimcollege.vic.edu.au",
  },
  {
    schoolName: "Ilim College — Doveton Campus",
    suburb: "Doveton",
    state: "VIC",
    address: "25-35 Rowan Dr",
    postcode: "3177",
    website: "https://ilimcollege.vic.edu.au",
  },
  {
    schoolName: "Ilim College — Glenroy Primary Campus",
    suburb: "Glenroy",
    state: "VIC",
    address: "48-50 Box Forest Rd",
    postcode: "3046",
    contactPhone: "03 9359 9660",
    contactEmail: "glenroycampus@ilimcollege.vic.edu.au",
    website: "https://ilimcollege.vic.edu.au",
  },
  {
    schoolName: "East Preston Islamic College",
    suburb: "Preston",
    state: "VIC",
    address: "55 Tyler Street",
    postcode: "3072",
    contactPhone: "03 9478 3323",
    contactName: "Ekrem Ozyurek",
    website: "https://epic.vic.edu.au",
  },
  {
    schoolName: "Australian International Academy — King Khalid Coburg Campus",
    suburb: "Coburg",
    state: "VIC",
    address: "653 Sydney Rd",
    postcode: "3058",
    website: "https://aia.edu.au",
  },
  {
    schoolName: "Australian International Academy — Melbourne Senior Campus",
    suburb: "Coburg North",
    state: "VIC",
    address: "56 Bakers Rd",
    postcode: "3056",
    website: "https://aia.edu.au",
  },
  {
    schoolName: "Australian International Academy — Caroline Springs Primary Campus",
    suburb: "Caroline Springs",
    state: "VIC",
    address: "5 Stevenson Cres",
    postcode: "3023",
    website: "https://aia.edu.au",
  },
  {
    schoolName: "Australian International Academy — Caroline Springs Senior Campus",
    suburb: "Caroline Springs",
    state: "VIC",
    address: "183-191 Caroline Springs Blvd",
    postcode: "3023",
    website: "https://aia.edu.au",
  },
  {
    schoolName: "Minaret College — Springvale Campus",
    suburb: "Springvale",
    state: "VIC",
    address: "36-38 Lewis St",
    postcode: "3171",
  },
  {
    schoolName: "Minaret College — Officer Campus",
    suburb: "Officer",
    state: "VIC",
    address: "67 Tivendale Rd",
    postcode: "3809",
  },
  {
    schoolName: "Minaret College — Doveton Campus",
    suburb: "Doveton",
    state: "VIC",
    address: "146 Kidds Rd",
    postcode: "3177",
  },
  {
    schoolName: "Darul Ulum College of Victoria",
    suburb: "Fawkner",
    state: "VIC",
    address: "17 Baird Street",
    postcode: "3060",
    contactPhone: "03 9355 6800",
    contactName: "Abdurrahman Gokler",
    website: "https://ducvic.edu.au",
  },
  {
    schoolName: "Darul Ulum Academy",
    suburb: "Mickleham",
    state: "VIC",
    address: "112 Ellscott Blvd",
    postcode: "3064",
    contactPhone: "03 9355 6890",
  },
  {
    schoolName: "Mt Hira College",
    suburb: "Keysborough",
    state: "VIC",
    address: "185 Perry Rd",
    postcode: "3173",
    contactPhone: "03 9709 0100",
    website: "https://mthira.vic.edu.au",
  },
  {
    schoolName: "Islamic College of Sport — Coburg Campus",
    suburb: "Coburg",
    state: "VIC",
    address: "19 Harding St",
    postcode: "3058",
  },
  {
    schoolName: "Islamic College of Sport — Endeavour Hills Campus",
    suburb: "Endeavour Hills",
    state: "VIC",
    address: "10 Raymond McMahon Blvd",
    postcode: "3802",
  },

  // ── QLD ─────────────────────────────────────────────────────────────
  {
    schoolName: "Islamic College of Brisbane",
    suburb: "Karawatha",
    state: "QLD",
    address: "45 Acacia Rd",
    postcode: "4117",
    contactPhone: "07 3841 3645",
    contactName: "Ray Barrett",
    website: "https://islamiccollegeofbrisbane.com.au",
  },
  {
    schoolName: "Australian International Islamic College — Durack Campus",
    suburb: "Durack",
    state: "QLD",
    address: "724 Blunder Rd",
    postcode: "4077",
    contactPhone: "07 3372 1400",
    website: "https://aiic.qld.edu.au",
  },
  {
    schoolName: "Australian International Islamic College — Brisbane City Campus",
    suburb: "Buranda",
    state: "QLD",
    address: "6 Agnes Street",
    postcode: "4102",
    contactPhone: "07 3391 7867",
    website: "https://aiic.qld.edu.au",
  },
  {
    schoolName: "Australian International Islamic College — Logan Campus",
    suburb: "Logan Reserve",
    state: "QLD",
    address: "500 Chambers Flat Rd",
    postcode: "4133",
    contactPhone: "07 3069 6100",
    website: "https://aiic.qld.edu.au",
  },
  {
    schoolName: "Australian International Islamic College — Gold Coast Campus",
    suburb: "Carrara",
    state: "QLD",
    address: "19 Chisholm Rd",
    postcode: "4211",
    contactPhone: "07 5596 6565",
    website: "https://aiic.qld.edu.au",
  },

  // ── WA ──────────────────────────────────────────────────────────────
  {
    schoolName: "Australian Islamic College — Kewdale Campus",
    suburb: "Kewdale",
    state: "WA",
    address: "139 President Street",
    postcode: "6105",
    website: "https://aicwa.edu.au",
  },
  {
    schoolName: "Australian Islamic College — Dianella Campus",
    suburb: "Dianella",
    state: "WA",
    address: "81 Cleveland Street",
    postcode: "6059",
    website: "https://aicwa.edu.au",
  },
  {
    schoolName: "Australian Islamic College — Thornlie Campus",
    suburb: "Thornlie",
    state: "WA",
    address: "17 Tonbridge Way",
    postcode: "6108",
    website: "https://aicwa.edu.au",
  },
  {
    schoolName: "Australian Islamic College — Henley Brook Campus",
    suburb: "Henley Brook",
    state: "WA",
    address: "10 Asturian Dr",
    postcode: "6055",
    website: "https://aicwa.edu.au",
  },
  {
    schoolName: "Australian Islamic College — Forrestdale Campus",
    suburb: "Forrestdale",
    state: "WA",
    address: "651 Nicholson Rd",
    postcode: "6112",
    website: "https://aicwa.edu.au",
  },
  {
    schoolName: "Al-Ameen College",
    suburb: "Langford",
    state: "WA",
    address: "57 Southgate Rd",
    postcode: "6147",
    contactPhone: "08 9458 5206",
    contactEmail: "principal@alameencollege.wa.edu.au",
    website: "https://alameencollege.wa.edu.au",
  },
  {
    schoolName: "Al-Hidayah Islamic School",
    suburb: "Bentley",
    state: "WA",
    address: "Cnr Hedley Street and Nyamup Way",
    postcode: "6102",
    contactPhone: "08 9351 8593",
  },

  // ── SA ──────────────────────────────────────────────────────────────
  {
    schoolName: "Australian Islamic College Adelaide",
    suburb: "West Croydon",
    state: "SA",
    address: "22A Cedar Ave",
    postcode: "5008",
  },

  // ── ACT ─────────────────────────────────────────────────────────────
  {
    schoolName: "Taqwa School",
    suburb: "Moncrieff",
    state: "ACT",
    address: "11 Yidaki Way",
    postcode: "2914",
    contactPhone: "+61 2 6181 6870",
    contactEmail: "info@taqwaschool.act.edu.au",
    website: "https://taqwaschool.act.edu.au",
  },

  // ── NT ──────────────────────────────────────────────────────────────
  {
    schoolName: "Australian International Islamic College — Darwin Campus",
    suburb: "Berrimah",
    state: "NT",
    address: "25 Bowerlee Rd",
    postcode: "0828",
    contactPhone: "08 7918 2786",
    contactName: "Andrew Taylor",
    website: "https://aiic.qld.edu.au",
  },
];

async function main() {
  console.log(
    "Monthly Muslim/Islamic schools rescan — importing new leads...\n"
  );

  const existing = await prisma.lead.findMany({
    select: { schoolName: true, suburb: true },
  });

  const seen = new Set(
    existing
      .filter((l) => l.schoolName && l.suburb)
      .map(
        (l) =>
          `${l.schoolName.toLowerCase().trim()}::${(l.suburb ?? "").toLowerCase().trim()}`
      )
  );

  let created = 0;
  let skipped = 0;

  for (const school of schools) {
    const key = `${school.schoolName.toLowerCase().trim()}::${school.suburb.toLowerCase().trim()}`;

    if (seen.has(key)) {
      console.log(`  ⏭  Skipped (exists): ${school.schoolName}`);
      skipped++;
      continue;
    }

    const notes = school.website ? `Website: ${school.website}` : undefined;

    await prisma.lead.create({
      data: {
        schoolName: school.schoolName,
        suburb: school.suburb,
        state: school.state,
        address: school.address,
        postcode: school.postcode,
        contactPhone: school.contactPhone,
        contactEmail: school.contactEmail,
        contactName: school.contactName,
        source: "community_connection" as const,
        pipelineStage: "new_lead" as const,
        notes,
      },
    });

    console.log(
      `  ✅ Created: ${school.schoolName} — ${school.suburb}, ${school.state}`
    );
    created++;
    seen.add(key);
  }

  console.log(
    `\nDone! ${created} created, ${skipped} skipped (already in CRM), ${schools.length} total in list.`
  );
}

main()
  .catch((e) => {
    console.error("Import failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
