import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// POST /api/marketing/templates/seed — seed pre-built OSHC content templates
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner"]);
  if (error) return error;

  const templates = [
    {
      name: "Enrolment Open — Term Announcement",
      platform: "facebook" as const,
      pillar: "Enrolment",
      content: `Enrolments are now OPEN for Term [X], [Year]! 🎉\n\nGive your child the best after-school experience at Amana OSHC — where learning meets play in a safe, nurturing environment.\n\n✅ Homework support & tutoring\n✅ Creative arts & STEM activities\n✅ Outdoor sports & active play\n✅ Healthy halal afternoon tea\n✅ Before & after school care\n\n📍 Available at [Centre Name]\n📞 Book a tour or enrol today — link in bio!\n\nLimited spots available. Don't miss out!`,
      notes: "Update term number, year, and centre name. Best posted 4-6 weeks before term starts.",
      hashtags: "#AmanaOSHC #Enrolments #OSHC #AfterSchoolCare #BeforeSchoolCare",
    },
    {
      name: "Open Day Invitation",
      platform: "facebook" as const,
      pillar: "Enrolment",
      content: `You're Invited! 🌟 Amana OSHC Open Day\n\nCome and see what makes Amana OSHC special!\n\n📅 Date: [Date]\n🕐 Time: [Time]\n📍 Location: [Centre Name & Address]\n\n🎨 Live activity demonstrations\n👋 Meet our qualified educators\n📋 On-the-spot enrolment assistance\n🍪 Light refreshments provided\n\nRSVP: [Link/Phone]`,
      notes: "Post 2 weeks before event with reminder 3 days prior.",
      hashtags: "#AmanaOSHC #OpenDay #OSHC #CommunityEvent",
    },
    {
      name: "Holiday Program Launch",
      platform: "facebook" as const,
      pillar: "Holiday Program",
      content: `🎉 School Holiday Program is HERE!\n\nWeek 1: [Theme]\nWeek 2: [Theme]\n\n🔬 STEM experiments\n🎨 Arts & cooking\n🏊 Excursions & incursions\n🤸 Sports & outdoor fun\n🍽️ Healthy halal meals included\n\n📅 [Start Date] — [End Date]\n📍 [Centre Name]\n💰 CCS approved\n\n👉 [Booking Link]`,
      notes: "Post 3-4 weeks before holidays begin. Customise themes per holiday period.",
      hashtags: "#AmanaOSHC #SchoolHolidays #HolidayProgram #KidsActivities",
    },
    {
      name: "Educator Spotlight",
      platform: "instagram" as const,
      pillar: "Team",
      content: `Meet [Name], one of our amazing educators at [Centre Name]! 🌟\n\n[Name] has been with Amana OSHC for [X] years and is passionate about [interest].\n\n🎓 Qualifications: [Qualification]\n💛 Favourite activity: [Activity]\n✨ Fun fact: [Fact]\n\nWe're so lucky to have you on the team! 👏`,
      notes: "Get educator's written consent. Rotate across centres monthly.",
      hashtags: "#AmanaOSHC #MeetTheTeam #OSHC #Educators #WeAreAmana",
    },
    {
      name: "Parent Testimonial Feature",
      platform: "instagram" as const,
      pillar: "Social Proof",
      content: `"[Parent quote]"\n\n— [Parent First Name], [Centre Name] Parent ⭐\n\nWe love hearing from our Amana families! Your trust means the world to us. 💛\n\nIf you'd like to share your experience, send us a DM!`,
      notes: "Must have written parent consent. Use branded quote card design.",
      hashtags: "#AmanaOSHC #ParentReview #Testimonial #OSHC #HappyFamilies",
    },
    {
      name: "We're Hiring",
      platform: "linkedin" as const,
      pillar: "Recruitment",
      content: `We're Growing! 🚀 Join the Amana OSHC Team\n\nLooking for passionate [Role] in [Location].\n\n✅ Competitive pay\n✅ Professional development\n✅ Values-driven workplace\n✅ Career progression\n\nRequirements:\n📋 Working with Children Check\n📋 First Aid & CPR\n📋 [Qualification]\n\nApply: [Link]`,
      notes: "LinkedIn best for recruitment. Cross-post to Facebook with adjusted tone.",
      hashtags: "#Hiring #AmanaOSHC #ChildCareJobs #EducatorJobs #JoinOurTeam",
    },
    {
      name: "Welcome Email — New Enrolment",
      platform: "email" as const,
      pillar: "Enrolment",
      content: `Dear [Parent Name],\n\nWelcome to the Amana OSHC family! We're thrilled that [Child Name] will be joining us at [Centre Name].\n\nGETTING STARTED\n• First day: [Date]\n• Drop-off/Pick-up times: [Times]\n• What to bring: Hat, water bottle, change of clothes\n\nIMPORTANT CONTACTS\n• Centre Coordinator: [Name] — [Phone]\n• Email: [Centre Email]\n\nWarm regards,\nThe Amana OSHC Team`,
      notes: "Send within 24 hours of enrolment confirmation.",
      hashtags: "",
    },
    {
      name: "Monthly Newsletter",
      platform: "newsletter" as const,
      pillar: "Community",
      content: `AMANA OSHC — [Month] [Year] Newsletter\n\nDear Families,\n\n📸 HIGHLIGHTS\n[Monthly highlights]\n\n📅 UPCOMING DATES\n• [Date]: [Event]\n\n🌟 EDUCATOR SPOTLIGHT\n[Short feature]\n\n📋 REMINDERS\n• [Reminder 1]\n• [Reminder 2]\n\nWarm regards,\n[Coordinator Name]\n[Centre Name]`,
      notes: "Send first week of each month. Include 2-3 photos.",
      hashtags: "",
    },
    {
      name: "Enrolment Flyer",
      platform: "flyer" as const,
      pillar: "Enrolment",
      content: `AMANA OSHC — NOW ENROLLING!\n\nBefore & After School Care | School Holiday Programs\n\n✅ Qualified educators\n✅ Homework support\n✅ Creative arts, STEM & sports\n✅ Healthy halal meals\n✅ CCS approved\n\n📍 [Centre Name & Address]\n📞 [Phone]\n📧 [Email]\n\nBOOK A TOUR TODAY!`,
      notes: "Design as A5 double-sided. Include QR code to enrolment page.",
      hashtags: "",
    },
    {
      name: "Back to School — Term Start",
      platform: "facebook" as const,
      pillar: "Education",
      content: `📚 Welcome back! Term [X] starts [Date]!\n\nWhat's new this term:\n🆕 [Activity 1]\n🆕 [Activity 2]\n🆕 [Activity 3]\n\nReminders:\n📋 Updated forms needed\n🎒 Label all belongings\n☀️ Sun-safe hats required\n\nLet's make it the best term yet! 🎉`,
      notes: "Post day before or morning of first day. Pin to Facebook page for first week.",
      hashtags: "#AmanaOSHC #BackToSchool #OSHC #NewTerm #WelcomeBack",
    },
  ];

  let created = 0;
  for (const tpl of templates) {
    const exists = await prisma.marketingTemplate.findFirst({
      where: { name: tpl.name, deleted: false },
    });
    if (!exists) {
      await prisma.marketingTemplate.create({
        data: {
          name: tpl.name,
          platform: tpl.platform,
          pillar: tpl.pillar || null,
          content: tpl.content,
          notes: tpl.notes || null,
          hashtags: tpl.hashtags || null,
        },
      });
      created++;
    }
  }

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "seed",
      entityType: "MarketingTemplate",
      entityId: "batch",
      details: { templatesCreated: created, totalAvailable: templates.length },
    },
  });

  return NextResponse.json({
    success: true,
    created,
    skipped: templates.length - created,
    total: templates.length,
  });
}
