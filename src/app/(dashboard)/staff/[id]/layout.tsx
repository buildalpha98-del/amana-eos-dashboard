import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StaffAvatar } from "@/components/staff/StaffAvatar";
import { RoleBadge } from "@/components/staff/RoleBadge";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function StaffProfileLayout({ children, params }: LayoutProps) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  // Fetch just the header data — deeper access checks happen in page.tsx
  const targetUser = session?.user
    ? await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          avatar: true,
          active: true,
          service: { select: { name: true } },
        },
      })
    : null;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Sticky header */}
      <div className="sticky top-0 md:top-0 z-20 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 border-b border-border -mx-4 md:-mx-8 px-4 md:px-8 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/team"
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </Link>
          {targetUser ? (
            <div className="flex items-center gap-3 min-w-0">
              <StaffAvatar
                user={{
                  id: targetUser.id,
                  name: targetUser.name,
                  avatar: targetUser.avatar,
                }}
                size="sm"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">
                    {targetUser.name}
                  </h1>
                  <RoleBadge role={targetUser.role} />
                  {!targetUser.active && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      Deactivated
                    </span>
                  )}
                </div>
                {targetUser.service?.name && (
                  <div className="text-xs text-muted truncate">
                    {targetUser.service.name}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <h1 className="text-base sm:text-lg font-semibold text-foreground">
              Staff profile
            </h1>
          )}
        </div>
      </div>

      <div className="pt-6">{children}</div>
    </div>
  );
}
