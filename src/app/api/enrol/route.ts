import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTeamsNotification } from "@/lib/teams-notify";
import { sendEmail, FROM_EMAIL } from "@/lib/email";
import { enrolmentConfirmationEmail } from "@/lib/email-templates";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      children,
      primaryParent,
      secondaryParent,
      medicals,
      emergencyContacts,
      authorisedPickup,
      consents,
      courtOrders,
      courtOrderFiles,
      medicalFiles,
      documentUploads,
      bookingPrefs,
      payment,
      referralSource,
      termsAccepted,
      privacyAccepted,
      debitAgreement,
      signature,
      prefillToken,
    } = body;

    // Basic validation
    if (!children?.length || !children[0]?.firstName) {
      return NextResponse.json({ error: "At least one child is required" }, { status: 400 });
    }
    if (!primaryParent?.firstName || !primaryParent?.email) {
      return NextResponse.json({ error: "Primary parent details required" }, { status: 400 });
    }
    if (!termsAccepted || !privacyAccepted) {
      return NextResponse.json({ error: "Terms and Privacy must be accepted" }, { status: 400 });
    }
    if (!signature) {
      return NextResponse.json({ error: "Digital signature required" }, { status: 400 });
    }
    if (!payment?.method) {
      return NextResponse.json({ error: "Payment method is required" }, { status: 400 });
    }
    if (!debitAgreement) {
      return NextResponse.json({ error: "Direct debit agreement is required" }, { status: 400 });
    }

    // Mask payment details — only store last 4 digits
    let maskedPayment = null;
    let paymentMethod = payment?.method || null;
    if (payment?.method === "credit_card" && payment.cardNumber) {
      maskedPayment = {
        lastFour: payment.cardNumber.slice(-4),
        cardType: detectCardType(payment.cardNumber),
        nameOnCard: payment.cardName,
      };
    } else if (payment?.method === "bank_account" && payment.bankAccountNumber) {
      maskedPayment = {
        bsbLastThree: payment.bankBsb.slice(-3),
        accountLastFour: payment.bankAccountNumber.slice(-4),
        accountName: payment.bankAccountName,
      };
    }

    // Merge medical + booking into children array for storage
    const enrichedChildren = children.map((child: Record<string, unknown>, i: number) => ({
      ...child,
      medical: medicals?.[i] || null,
      bookingPrefs: bookingPrefs?.[i] || null,
    }));

    // Find linked enquiry
    let enquiryId: string | null = null;
    let serviceId: string | null = null;
    if (prefillToken) {
      const enquiry = await prisma.parentEnquiry.findFirst({
        where: { id: prefillToken },
        select: { id: true, serviceId: true },
      });
      if (enquiry) {
        enquiryId = enquiry.id;
        serviceId = enquiry.serviceId;
      }
    }
    // Also try serviceId from first booking pref
    if (!serviceId && bookingPrefs?.[0]?.serviceId) {
      serviceId = bookingPrefs[0].serviceId;
    }

    // Create submission
    const submission = await prisma.enrolmentSubmission.create({
      data: {
        enquiryId,
        serviceId,
        primaryParent,
        secondaryParent: secondaryParent?.firstName ? secondaryParent : undefined,
        children: enrichedChildren,
        emergencyContacts: emergencyContacts.filter((c: { name: string }) => c.name),
        authorisedPickup: authorisedPickup?.length > 0 ? authorisedPickup : undefined,
        consents,
        paymentMethod,
        paymentDetails: maskedPayment ?? undefined,
        referralSource,
        signature,
        termsAccepted,
        privacyAccepted,
        debitAgreement,
        courtOrders,
        courtOrderFiles: courtOrderFiles?.length > 0 ? courtOrderFiles : undefined,
        medicalFiles: medicalFiles?.length > 0 ? medicalFiles : undefined,
        documentUploads: documentUploads?.length > 0 ? documentUploads : undefined,
      },
    });

    // Update enquiry stage if linked
    if (enquiryId) {
      await prisma.parentEnquiry.update({
        where: { id: enquiryId },
        data: {
          stage: "enrolled",
          formCompleted: true,
          stageChangedAt: new Date(),
        },
      });
    }

    // Teams notification (fire and forget)
    const childNames = children
      .map((c: { firstName: string; surname: string }) => `${c.firstName} ${c.surname}`)
      .join(", ");
    sendTeamsNotification({
      title: "New Enrolment Submitted",
      body: `${primaryParent.firstName} ${primaryParent.surname} has submitted an enrolment for ${childNames}.`,
      facts: [
        { title: "Parent Email", value: primaryParent.email },
        { title: "Parent Phone", value: primaryParent.mobile || "—" },
        { title: "Children", value: childNames },
      ],
      actions: [
        {
          type: "Action.OpenUrl",
          title: "View Submission",
          url: `${process.env.NEXTAUTH_URL}/enrolments`,
        },
      ],
    }).catch(() => {});

    // Send confirmation email to parent (fire and forget)
    if (primaryParent.email) {
      const { subject, html } = enrolmentConfirmationEmail(
        primaryParent.firstName,
        childNames
      );
      sendEmail({
        from: FROM_EMAIL,
        to: primaryParent.email,
        subject,
        html,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      id: submission.id,
      token: submission.token,
      childNames,
      parentName: `${primaryParent.firstName} ${primaryParent.surname}`,
    });
  } catch (e) {
    console.error("Enrolment submission error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Submission failed" },
      { status: 500 }
    );
  }
}

function detectCardType(number: string): string {
  if (number.startsWith("4")) return "visa";
  if (/^5[1-5]/.test(number) || /^2[2-7]/.test(number)) return "mastercard";
  if (number.startsWith("3") && ["4", "7"].includes(number[1])) return "amex";
  return "unknown";
}
