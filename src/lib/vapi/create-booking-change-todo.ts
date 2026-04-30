/**
 * Auto-create a Todo for the centre coordinator when a VAPI booking-change call
 * comes in. Gives the team an actionable work item linked to the original call,
 * so nothing falls through the cracks between the Calls tab and OWNA.
 */

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { resolveServiceId } from "@/lib/vapi/centre-resolver";

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function computeDueDate(urgency: string, effectiveDate: string | undefined): Date {
  const now = new Date();
  // If the caller specified an effective date we can parse, act by the end of the previous business day.
  if (effectiveDate) {
    const parsed = new Date(effectiveDate);
    if (!isNaN(parsed.getTime()) && parsed.getTime() > now.getTime()) {
      return parsed;
    }
  }
  if (urgency === "critical") return new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2h
  if (urgency === "urgent") return new Date(now.getTime() + 4 * 60 * 60 * 1000); // 4h
  // Routine: 24h
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

function formatChangeType(raw: unknown): string {
  if (typeof raw !== "string") return "booking change";
  const map: Record<string, string> = {
    add_day: "add a day",
    remove_day: "remove a day",
    swap_day: "swap a day",
    casual_booking: "casual booking",
    cancel_enrolment: "cancel enrolment",
    casual_to_permanent: "convert casual → permanent",
    permanent_to_casual: "convert permanent → casual",
    temporary_change: "temporary change",
  };
  return map[raw] ?? raw.replace(/_/g, " ");
}

export async function createBookingChangeTodo(callId: string): Promise<string | null> {
  const call = await prisma.vapiCall.findUnique({ where: { id: callId } });
  if (!call) return null;
  if (call.callType !== "booking_change") return null;
  if (call.linkedTodoId) return call.linkedTodoId;

  const serviceId = await resolveServiceId(call.centreName);
  if (!serviceId) {
    logger.info("VAPI: skipping todo creation — centre not resolved", {
      callId,
      centreName: call.centreName,
    });
    return null;
  }

  // Resolve coordinator: service manager first, else fall back to null (todo visible to all centre staff).
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { managerId: true, name: true },
  });

  const details = (call.callDetails as Record<string, unknown>) ?? {};
  const changeTypeLabel = formatChangeType(details.changeType);
  const effectiveDate = typeof details.effectiveDate === "string" ? details.effectiveDate : undefined;
  const parentName = call.parentName ?? "Unknown caller";
  const childName = call.childName ? ` (${call.childName})` : "";

  const title = `Booking change: ${parentName}${childName} — ${changeTypeLabel}`;

  const descriptionParts = [
    call.summary ? call.summary : null,
    details.requestedChange ? `Requested change: ${details.requestedChange}` : null,
    details.currentBooking ? `Current booking: ${details.currentBooking}` : null,
    effectiveDate ? `Effective date: ${effectiveDate}` : null,
    call.parentPhone ? `Parent phone: ${call.parentPhone}` : null,
    call.parentEmail ? `Parent email: ${call.parentEmail}` : null,
    `Action: review call recording and process in OWNA, then confirm with parent.`,
    `Source: VAPI call ${call.id}`,
  ].filter(Boolean);

  const dueDate = computeDueDate(call.urgency, effectiveDate);

  try {
    const todo = await prisma.todo.create({
      data: {
        title,
        description: descriptionParts.join("\n\n"),
        assigneeId: service?.managerId ?? null,
        serviceId,
        dueDate,
        weekOf: startOfWeek(new Date()),
        status: "pending",
      },
    });

    await prisma.vapiCall.update({
      where: { id: call.id },
      data: { linkedTodoId: todo.id },
    });

    logger.info("VAPI: auto-created booking-change todo", {
      callId,
      todoId: todo.id,
      serviceId,
      assigneeId: service?.managerId ?? null,
    });

    return todo.id;
  } catch (err) {
    logger.error("VAPI: failed to auto-create booking-change todo", { callId, error: err });
    return null;
  }
}
