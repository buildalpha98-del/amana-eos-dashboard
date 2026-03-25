"use client";

import { CalendarDays, Phone, Mail } from "lucide-react";
import { useParentProfile } from "@/hooks/useParentPortal";
import { Skeleton } from "@/components/ui/Skeleton";

export default function BookingsPage() {
  const { data: profile, isLoading } = useParentProfile();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-heading font-bold text-[#1a1a2e]">
          Bookings
        </h1>
        <p className="text-sm text-[#7c7c8a] mt-1">
          Manage your children&apos;s bookings and sessions.
        </p>
      </div>

      {/* Coming soon notice */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-[#e8e4df] text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#FECE00]/20 mb-4">
          <CalendarDays className="w-7 h-7 text-[#004E64]" />
        </div>
        <h2 className="text-lg font-heading font-semibold text-[#1a1a2e] mb-2">
          Online bookings coming soon
        </h2>
        <p className="text-sm text-[#7c7c8a] max-w-xs mx-auto leading-relaxed">
          We&apos;re working on letting you manage bookings online. For now,
          please contact your centre directly to make any changes.
        </p>
      </div>

      {/* Enrolled services */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : profile && profile.children.length > 0 ? (
        <section>
          <h2 className="text-sm font-heading font-semibold text-[#7c7c8a] uppercase tracking-wider mb-3">
            Enrolled Services
          </h2>
          <div className="space-y-3">
            {/* Deduplicate services */}
            {Array.from(
              new Map(
                profile.children.map((c) => [c.serviceId, c.serviceName])
              ).entries()
            ).map(([serviceId, serviceName]) => (
              <div
                key={serviceId}
                className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df]"
              >
                <h3 className="text-base font-heading font-semibold text-[#1a1a2e]">
                  {serviceName}
                </h3>
                <p className="text-sm text-[#7c7c8a] mt-1">
                  {profile.children
                    .filter((c) => c.serviceId === serviceId)
                    .map((c) => c.firstName)
                    .join(", ")}{" "}
                  enrolled
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Contact info */}
      <section>
        <h2 className="text-sm font-heading font-semibold text-[#7c7c8a] uppercase tracking-wider mb-3">
          Contact Your Centre
        </h2>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-[#e8e4df] space-y-3">
          <a
            href="tel:0297408070"
            className="flex items-center gap-3 text-sm text-[#004E64] hover:text-[#0A7E9E] font-medium transition-colors min-h-[44px]"
          >
            <Phone className="w-4 h-4" />
            (02) 9740 8070
          </a>
          <a
            href="mailto:info@amanaoshc.com.au"
            className="flex items-center gap-3 text-sm text-[#004E64] hover:text-[#0A7E9E] font-medium transition-colors min-h-[44px]"
          >
            <Mail className="w-4 h-4" />
            info@amanaoshc.com.au
          </a>
        </div>
      </section>
    </div>
  );
}
