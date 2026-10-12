import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { EmailBlock } from "@/lib/email-marketing-layout";
import type { EmailTemplateAudience, EmailTemplateCategory } from "@prisma/client";
import { withApiAuth } from "@/lib/server-auth";
import { isAdminRole } from "@/lib/role-permissions";

/**
 * POST /api/email-templates/seed
 *
 * Seeds the EmailTemplate table with the existing coded parent-facing
 * email templates so they're editable in the visual email composer.
 * Only creates templates that don't already exist (by name).
 */
export const POST = withApiAuth(async (req, session) => {
if (!isAdminRole(session?.user?.role || "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const templates: Array<{
    name: string;
    category: EmailTemplateCategory;
    audience?: EmailTemplateAudience;
    subject: string;
    blocks: EmailBlock[];
  }> = [
    {
      name: "Enrolment Confirmation",
      category: "enrolment",
      subject: "Enrolment Received — Amana OSHC",
      blocks: [
        { type: "heading", text: "Enrolment Submitted Successfully", level: "h2" },
        { type: "text", content: "Hi {{parentName}}," },
        { type: "text", content: "Thank you for completing the enrolment form for {{childNames}}. Our team will review your submission and be in touch within 1-2 business days to confirm your enrolment details." },
        { type: "text", content: "If you have any questions in the meantime, feel free to contact us." },
        { type: "text", content: "Warm regards,\nThe Amana OSHC Team" },
      ],
    },
    {
      name: "Complete Your Enrolment",
      category: "enrolment",
      subject: "Complete Your Enrolment — Amana OSHC",
      blocks: [
        { type: "heading", text: "Complete Your Enrolment", level: "h2" },
        { type: "text", content: "Hi {{parentName}}," },
        { type: "text", content: "We're excited to welcome your family to Amana OSHC! Please click the button below to complete the enrolment form. Some of your details have been pre-filled to save you time." },
        { type: "button", label: "Complete Enrolment", url: "{{enrolUrl}}", color: "#004E64" },
        { type: "text", content: "The form takes approximately 10-15 minutes to complete. You can save your progress and return at any time." },
        { type: "text", content: "Warm regards,\nThe Amana OSHC Team" },
      ],
    },
    {
      name: "Welcome to Amana OSHC",
      category: "nurture",
      subject: "Welcome to {{centreName}}!",
      blocks: [
        { type: "heading", text: "Welcome to the Amana Family!", level: "h2" },
        { type: "text", content: "Hi {{firstName}}," },
        { type: "text", content: "We're thrilled to welcome your family to {{centreName}}! Our team is committed to providing a safe, fun, and enriching environment for your child." },
        { type: "text", content: "Here's what happens next:\n\n1. Our team will confirm your booking details\n2. You'll receive information about your child's first day\n3. We'll send you the Amana OSHC parent app details" },
        { type: "button", label: "Learn More About Us", url: "https://amanaoshc.com.au", color: "#004E64" },
        { type: "text", content: "If you have any questions, don't hesitate to reach out. We're here to help!\n\nWarm regards,\nThe {{centreName}} Team" },
      ],
    },
    {
      name: "First Session Reminder",
      category: "nurture",
      subject: "See you tomorrow! — {{centreName}}",
      blocks: [
        { type: "heading", text: "See You Tomorrow!", level: "h2" },
        { type: "text", content: "Hi {{firstName}}," },
        { type: "text", content: "We're excited to welcome your child to {{centreName}} tomorrow! Here's everything you need to know for a smooth first day." },
        { type: "heading", text: "What to Bring", level: "h3" },
        { type: "text", content: "• A labelled water bottle\n• A hat (we are a SunSmart centre)\n• Comfortable clothes and shoes for active play\n• A change of clothes (just in case)\n• Any medication with a signed medication form" },
        { type: "heading", text: "Drop-off & Pickup", level: "h3" },
        { type: "text", content: "• Before School Care: Drop off from 6:30 AM\n• After School Care: Pick up by 6:00 PM\n• Please sign your child in and out at the front desk\n• Only authorised persons can collect your child" },
        { type: "text", content: "If you have any last-minute questions, feel free to call or message us.\n\nSee you soon!\nThe {{centreName}} Team" },
      ],
    },
    {
      name: "How to Enrol",
      category: "nurture",
      subject: "Ready to enrol? Here's how — {{centreName}}",
      blocks: [
        { type: "heading", text: "Enrolling is Easy!", level: "h2" },
        { type: "text", content: "Hi {{firstName}}," },
        { type: "text", content: "Thank you for your interest in {{centreName}}! Enrolling your child is quick and easy — here's what you'll need:" },
        { type: "text", content: "1. Your child's details (name, DOB, medical info)\n2. Parent/guardian contact information\n3. Emergency contact details\n4. Medicare and immunisation records\n5. Payment details for direct debit" },
        { type: "button", label: "Start Enrolment", url: "{{enrolUrl}}", color: "#004E64" },
        { type: "text", content: "The form takes about 10-15 minutes and you can save your progress at any time.\n\nWarm regards,\nThe {{centreName}} Team" },
      ],
    },
    {
      name: "Enrolment Form Help",
      category: "nurture",
      subject: "Need help with your enrolment? — Amana OSHC",
      blocks: [
        { type: "heading", text: "Need a Hand?", level: "h2" },
        { type: "text", content: "Hi {{firstName}}," },
        { type: "text", content: "We noticed you started the enrolment form but haven't finished yet. No worries — your progress has been saved!" },
        { type: "text", content: "If you got stuck or have any questions, our friendly team is here to help. You can:" },
        { type: "text", content: "• Continue where you left off using the button below\n• Call us and we'll walk you through it\n• Reply to this email with any questions" },
        { type: "button", label: "Continue Enrolment", url: "{{enrolUrl}}", color: "#004E64" },
        { type: "text", content: "We'd love to have your family join us!\n\nWarm regards,\nThe Amana OSHC Team" },
      ],
    },
    {
      name: "CCS Assistance",
      category: "nurture",
      subject: "Did you know? You may be eligible for CCS — Amana OSHC",
      blocks: [
        { type: "heading", text: "Child Care Subsidy (CCS)", level: "h2" },
        { type: "text", content: "Hi {{firstName}}," },
        { type: "text", content: "Did you know that families using Out of School Hours Care may be eligible for the Child Care Subsidy (CCS)? This government subsidy can significantly reduce your fees." },
        { type: "text", content: "To check your eligibility and estimate your subsidy:\n\n1. Log into your myGov account\n2. Link to Centrelink\n3. Apply for CCS under 'Child Care'" },
        { type: "button", label: "Calculate Your CCS", url: "{{ccsCalculatorUrl}}", color: "#004E64" },
        { type: "text", content: "Our team can also help you navigate the process. Just ask!\n\nWarm regards,\nThe {{centreName}} Team" },
      ],
    },
    {
      name: "NPS Survey",
      category: "nurture",
      subject: "How are we doing? — {{centreName}}",
      blocks: [
        { type: "heading", text: "We'd Love Your Feedback", level: "h2" },
        { type: "text", content: "Hi {{firstName}}," },
        { type: "text", content: "Your child has been with us for a little while now and we'd love to hear how things are going. Your feedback helps us improve and deliver the best experience for your family." },
        { type: "text", content: "It takes less than 2 minutes:" },
        { type: "button", label: "Share Feedback", url: "{{surveyUrl}}", color: "#004E64" },
        { type: "text", content: "Thank you for being part of the Amana family!\n\nWarm regards,\nThe {{centreName}} Team" },
      ],
    },
    // ── Staff starters (Daniel, 12 Oct 2026) — used by Communication →
    // Staff emails → Designed email. [Square brackets] are blanks to fill.
    {
      name: "Staff — Policy update",
      category: "announcement",
      audience: "staff",
      subject: "Policy update: [Policy name]",
      blocks: [
        { type: "heading", text: "Policy update: [Policy name]", level: "h1" },
        { type: "text", content: "Assalamu Alaikum {{firstName}}," },
        { type: "text", content: "We've updated our [Policy name] policy. Here's what's changed and what it means for you on the floor:" },
        { type: "text", content: "• [Change one]\n• [Change two]\n• [Change three]" },
        { type: "button", label: "Read the full policy", url: "/policies", color: "#004E64" },
        { type: "text", content: "Please read and acknowledge it in the dashboard by [date]. If anything is unclear, have a chat with your coordinator." },
        { type: "text", content: "Jazak Allahu Khairan,\nThe Amana OSHC team" },
      ],
    },
    {
      name: "Staff — Wellbeing check-in",
      category: "newsletter",
      audience: "staff",
      subject: "A moment for you, {{firstName}}",
      blocks: [
        { type: "heading", text: "Looking after you, too", level: "h1" },
        { type: "text", content: "Assalamu Alaikum {{firstName}}," },
        { type: "text", content: "You give so much to our children every afternoon. This week we'd like to give a little back. Here's one small thing to try:" },
        { type: "heading", text: "[This week's tip]", level: "h3" },
        { type: "text", content: "[Two or three sentences on the tip: a breathing exercise, a walk after shift, a reminder to drink water.]" },
        { type: "divider" },
        { type: "text", content: "Need someone to talk to? Your coordinator and the office are always here, and our Employee Assistance Program is free and confidential." },
        { type: "text", content: "Take care of yourself,\nThe Amana OSHC team" },
      ],
    },
    {
      name: "Staff — Professional development",
      category: "event",
      audience: "staff",
      subject: "Grow with us: [Training name]",
      blocks: [
        { type: "heading", text: "Grow with us: [Training name]", level: "h1" },
        { type: "text", content: "Assalamu Alaikum {{firstName}}," },
        { type: "text", content: "We'd love you to join [Training name], a chance to build your skills and bring fresh ideas back to your centre." },
        { type: "text", content: "When: [Date and time]\nWhere: [Location or online]\nWho: [Who it's for]" },
        { type: "button", label: "Start the training", url: "/my-training", color: "#004E64" },
        { type: "text", content: "Jazak Allahu Khairan,\nThe Amana OSHC team" },
      ],
    },
    {
      name: "Staff — Term kick-off",
      category: "welcome",
      audience: "staff",
      subject: "Welcome back to Term [N], {{firstName}}!",
      blocks: [
        { type: "heading", text: "Welcome back to Term [N]!", level: "h1" },
        { type: "text", content: "Assalamu Alaikum {{firstName}}," },
        { type: "text", content: "A new term, a new chance to make every afternoon count beyond the bell. Here's what's coming up:" },
        { type: "text", content: "• [Program highlight]\n• [Key date]\n• [Reminder]" },
        { type: "button", label: "See this term's program", url: "/my-portal", color: "#004E64" },
        { type: "text", content: "Thank you for everything you do. Let's make it a great one.\n\nThe Amana OSHC team" },
      ],
    },
    {
      name: "Staff — Shout-out",
      category: "custom",
      audience: "staff",
      subject: "A big thank you to [Name]",
      blocks: [
        { type: "heading", text: "Shout-out: [Name]", level: "h1" },
        { type: "text", content: "Assalamu Alaikum {{firstName}}," },
        { type: "text", content: "This week we want to recognise [Name] at [Centre] for [what they did]." },
        { type: "text", content: "[A sentence or two from a family, child or colleague.]" },
        { type: "text", content: "Know someone who deserves a shout-out? Reply to this email and tell us.\n\nThe Amana OSHC team" },
      ],
    },
    {
      name: "Community newsletter",
      category: "newsletter",
      audience: "both",
      subject: "Beyond The Bell — [Month] update",
      blocks: [
        { type: "heading", text: "Beyond The Bell — [Month]", level: "h1" },
        { type: "text", content: "Assalamu Alaikum {{firstName}}," },
        { type: "text", content: "Here's what's been happening across Amana OSHC this month." },
        { type: "heading", text: "[Highlight one]", level: "h2" },
        { type: "text", content: "[A short paragraph about it.]" },
        { type: "heading", text: "[Highlight two]", level: "h2" },
        { type: "text", content: "[A short paragraph about it.]" },
        { type: "divider" },
        { type: "heading", text: "Coming up", level: "h3" },
        { type: "text", content: "• [Date]: [Event]\n• [Date]: [Event]" },
        { type: "button", label: "Visit our website", url: "https://amanaoshc.com.au", color: "#004E64" },
        { type: "text", content: "With warm regards,\nThe Amana OSHC team" },
      ],
    },
  ];

  let created = 0;
  let skipped = 0;

  for (const t of templates) {
    const existing = await prisma.emailTemplate.findFirst({
      where: { name: t.name },
    });
    if (existing) {
      skipped++;
      continue;
    }

    await prisma.emailTemplate.create({
      data: {
        name: t.name,
        category: t.category,
        audience: t.audience ?? "parents",
        subject: t.subject,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        blocks: t.blocks as any,
        createdById: session!.user.id,
      },
    });
    created++;
  }

  return NextResponse.json({
    success: true,
    created,
    skipped,
    total: templates.length,
  });
});
