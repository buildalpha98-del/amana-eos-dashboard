import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ArrowLeft, Baby } from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

function calculateAge(dob: Date): string {
  const now = new Date();
  let years = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) years--;
  return `${years} yrs`;
}

function formatDob(dob: Date | null | undefined): string {
  if (!dob) return "";
  return new Date(dob).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ChildProfileLayout({ children, params }: LayoutProps) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  // Fetch only header-level data here — deeper access checks run in page.tsx.
  const child = session?.user
    ? await prisma.child.findUnique({
        where: { id },
        select: {
          id: true,
          firstName: true,
          surname: true,
          dob: true,
          photo: true,
          status: true,
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
            href="/children"
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Children</span>
          </Link>
          {child ? (
            <div className="flex items-center gap-3 min-w-0">
              {child.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={child.photo}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-brand/10 flex items-center justify-center shrink-0">
                  <Baby className="w-5 h-5 text-brand" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-base sm:text-lg font-semibold text-foreground truncate">
                    {child.firstName} {child.surname}
                  </h1>
                  {child.status && (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        child.status === "active"
                          ? "bg-green-50 text-green-700"
                          : child.status === "withdrawn"
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {child.status}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted truncate">
                  {child.dob && `${formatDob(child.dob)} · ${calculateAge(child.dob)}`}
                  {child.dob && child.service?.name ? " · " : ""}
                  {child.service?.name}
                </div>
              </div>
            </div>
          ) : (
            <h1 className="text-base sm:text-lg font-semibold text-foreground">
              Child profile
            </h1>
          )}
        </div>
      </div>

      <div className="pt-6">{children}</div>
    </div>
  );
}
