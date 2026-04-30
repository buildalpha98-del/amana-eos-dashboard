import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/role-permissions";
import { logger } from "@/lib/logger";
import { ChildProfileTabs, type ChildProfileTabKey } from "@/components/child/ChildProfileTabs";

const VALID_TABS: ReadonlySet<ChildProfileTabKey> = new Set([
  "details",
  "room",
  "relationships",
  "medical",
  "attendances",
  "documents",
]);

function coerceTab(value: string | undefined): ChildProfileTabKey {
  if (value && VALID_TABS.has(value as ChildProfileTabKey)) {
    return value as ChildProfileTabKey;
  }
  return "details";
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function ChildDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const tab = coerceTab(sp.tab);

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const child = await prisma.child.findUnique({
    where: { id },
    include: {
      service: { select: { id: true, name: true, code: true } },
      enrolment: {
        select: {
          id: true,
          token: true,
          primaryParent: true,
          secondaryParent: true,
          emergencyContacts: true,
          authorisedPickup: true,
          consents: true,
          paymentMethod: true,
          paymentDetails: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  if (!child) notFound();

  // ── Access gate ────────────────────────────────────────────
  const role = session.user.role;
  const viewerServiceId = session.user.serviceId ?? null;
  const hasAccess =
    isAdminRole(role) ||
    (!!child.serviceId && viewerServiceId === child.serviceId);

  if (!hasAccess) {
    logger.warn("Child detail access denied", {
      viewerId: session.user.id,
      role,
      childId: id,
    });
    return (
      <div className="p-6">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-lg font-semibold text-foreground">Access denied</h1>
          <p className="text-sm text-muted mt-2">
            You don&apos;t have permission to view this child.
          </p>
        </div>
      </div>
    );
  }

  const canEdit = isAdminRole(role) || role === "coordinator";

  return (
    <ChildProfileTabs
      child={child}
      activeTab={tab}
      canEdit={canEdit}
    />
  );
}
