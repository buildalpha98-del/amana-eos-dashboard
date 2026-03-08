import { prisma } from "@/lib/prisma";
import { getResend, FROM_EMAIL } from "@/lib/email";

/**
 * Generate a unique service code from a school name.
 * Takes the first 3 alpha characters (uppercased) + random 3-digit suffix.
 * Retries up to 5 times if a collision occurs.
 */
async function generateServiceCode(schoolName: string): Promise<string> {
  const prefix = schoolName
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");

  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = String(Math.floor(Math.random() * 900) + 100);
    const code = `${prefix}-${suffix}`;
    const existing = await prisma.service.findUnique({ where: { code } });
    if (!existing) return code;
  }

  // Fallback: use timestamp
  return `${prefix}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

/**
 * Handles everything that happens when a lead is marked as "won":
 * 1. Create a Service from the lead data
 * 2. Create a Project from the "Onboarding" template (if it exists)
 * 3. Link the lead to the new service
 * 4. Log activity
 * 5. Send notification email (fire-and-forget)
 */
export async function handleLeadWon(
  leadId: string,
  userId: string
): Promise<{ serviceId: string; projectId?: string }> {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { assignedTo: { select: { name: true, email: true } } },
  });

  // 1. Create Service
  const code = await generateServiceCode(lead.schoolName);
  const service = await prisma.service.create({
    data: {
      name: lead.schoolName,
      code,
      address: lead.address,
      suburb: lead.suburb,
      state: lead.state,
      postcode: lead.postcode,
      status: "onboarding",
      managerId: lead.assignedToId,
    },
  });

  // 2. Create Project from template (prefer "Centre Launch", fallback to "Onboarding")
  let projectId: string | undefined;
  const template =
    (await prisma.projectTemplate.findFirst({
      where: { name: { contains: "Centre Launch", mode: "insensitive" } },
      include: { tasks: { orderBy: { sortOrder: "asc" } } },
    })) ??
    (await prisma.projectTemplate.findFirst({
      where: { name: { contains: "Onboarding", mode: "insensitive" } },
      include: { tasks: { orderBy: { sortOrder: "asc" } } },
    }));

  if (template) {
    const templateLabel = template.name.toLowerCase().includes("launch")
      ? "Centre Launch"
      : "Onboarding";
    const project = await prisma.project.create({
      data: {
        name: `${lead.schoolName} — ${templateLabel}`,
        serviceId: service.id,
        templateId: template.id,
        ownerId: lead.assignedToId || userId,
        startDate: new Date(),
        status: "in_progress",
      },
    });
    projectId = project.id;

    // Auto-generate todos from template tasks
    const today = new Date();
    const weekOf = new Date(today);
    weekOf.setDate(weekOf.getDate() - weekOf.getDay() + 1); // Monday of this week

    for (const task of template.tasks) {
      const dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + (task.defaultDays ?? 14));

      await prisma.todo.create({
        data: {
          title: task.title,
          description: task.description,
          assigneeId: lead.assignedToId || userId,
          createdById: userId,
          projectId: project.id,
          serviceId: service.id,
          dueDate,
          weekOf,
          status: "pending",
        },
      });
    }

    await prisma.activityLog.create({
      data: {
        userId,
        action: "create",
        entityType: "Project",
        entityId: project.id,
        details: {
          name: project.name,
          templateId: template.id,
          trigger: "crm_won",
        },
      },
    });
  }

  // 3. Link lead → service
  await prisma.lead.update({
    where: { id: leadId },
    data: { serviceId: service.id, wonAt: new Date() },
  });

  // 4. Log activity for the service creation
  await prisma.activityLog.create({
    data: {
      userId,
      action: "create",
      entityType: "Service",
      entityId: service.id,
      details: {
        name: service.name,
        code: service.code,
        trigger: "crm_won",
        leadId,
      },
    },
  });

  // 5. Fire-and-forget notification email
  const resend = getResend();
  if (resend && lead.assignedTo?.email) {
    const baseUrl =
      process.env.NEXTAUTH_URL || "https://dashboard.amanaoshc.com.au";

    resend.emails
      .send({
        from: FROM_EMAIL,
        to: lead.assignedTo.email,
        subject: `🎉 Deal Won — ${lead.schoolName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #003344;">Deal Won!</h2>
            <p>Hi ${lead.assignedTo.name || "there"},</p>
            <p><strong>${lead.schoolName}</strong> has been marked as won. Here's what was auto-created:</p>
            <ul>
              <li><strong>Service:</strong> ${service.name} (${service.code})</li>
              ${projectId ? `<li><strong>Launch Project:</strong> created with todos from template</li>` : ""}
            </ul>
            <p>
              <a href="${baseUrl}/services" style="display: inline-block; padding: 10px 20px; background: #003344; color: white; text-decoration: none; border-radius: 6px;">
                View Services
              </a>
            </p>
          </div>
        `,
      })
      .catch(console.error);
  }

  return { serviceId: service.id, projectId };
}
