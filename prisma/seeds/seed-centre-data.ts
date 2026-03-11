import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const centreData = [
  {
    nameMatch: "MFIS Greenacre",
    data: {
      schoolPopulation: 1000,
      ascTarget: 80,
      bscTarget: 20,
      parentSegment: "need",
      parentDriver: "homework",
      launchPhase: "mature",
    },
  },
  {
    nameMatch: "MFIS Hoxton Park",
    data: {
      schoolPopulation: 400,
      ascTarget: 50,
      bscTarget: 15,
      parentSegment: "mixed",
      parentDriver: "quran",
      launchPhase: "mature",
    },
  },
  {
    nameMatch: "MFIS Beaumont Hills",
    data: {
      schoolPopulation: 220,
      ascTarget: 35,
      bscTarget: 10,
      parentSegment: "need",
      parentDriver: "homework",
      launchPhase: "mature",
    },
  },
  {
    nameMatch: "Arkana",
    data: {
      schoolPopulation: 250,
      ascTarget: 30,
      bscTarget: 8,
      parentSegment: "want",
      parentDriver: "enrichment",
      launchPhase: "mature",
    },
  },
  {
    nameMatch: "Unity Grammar",
    data: {
      schoolPopulation: 800,
      ascTarget: 60,
      bscTarget: 15,
      parentSegment: "want",
      parentDriver: "enrichment",
      launchPhase: "mature",
    },
  },
  {
    nameMatch: "Al-Taqwa",
    data: {
      schoolPopulation: 1100,
      ascTarget: 60,
      bscTarget: 15,
      parentSegment: "need",
      parentDriver: "working_parents",
      launchDate: new Date("2026-02-03"),
      launchPhase: "launch",
    },
  },
  {
    nameMatch: "Minaret Officer",
    data: {
      schoolPopulation: 900,
      ascTarget: 50,
      bscTarget: 12,
      parentSegment: "need",
      parentDriver: "working_parents",
      launchDate: new Date("2026-02-03"),
      launchPhase: "launch",
    },
  },
  {
    nameMatch: "Minaret Springvale",
    data: {
      schoolPopulation: 900,
      ascTarget: 40,
      bscTarget: 10,
      parentSegment: "want",
      parentDriver: "quran",
      launchDate: new Date("2026-02-03"),
      launchPhase: "launch",
    },
  },
  {
    nameMatch: "Minaret Doveton",
    data: {
      schoolPopulation: 500,
      ascTarget: 30,
      bscTarget: 8,
      parentSegment: "need",
      parentDriver: "working_parents",
      launchDate: new Date("2026-02-03"),
      launchPhase: "launch",
    },
  },
  {
    nameMatch: "AIA",
    data: {
      schoolPopulation: 500,
      ascTarget: 35,
      bscTarget: 10,
      parentSegment: "mixed",
      parentDriver: "homework",
      launchPhase: "mature",
    },
  },
];

async function main() {
  console.log("Seeding centre marketing data...");

  for (const centre of centreData) {
    const service = await prisma.service.findFirst({
      where: { name: { contains: centre.nameMatch, mode: "insensitive" } },
      select: { id: true, name: true },
    });

    if (!service) {
      console.warn(`  ⚠ No service found matching "${centre.nameMatch}" — skipping`);
      continue;
    }

    await prisma.service.update({
      where: { id: service.id },
      data: centre.data,
    });

    console.log(`  ✓ Updated ${service.name}`);
  }

  console.log("Done seeding centre data.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
