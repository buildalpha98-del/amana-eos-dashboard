"use client";

import { Suspense, useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { isFulfillerRole } from "@/lib/creative-request/constants";
import { RequestBoard } from "@/components/requests/RequestBoard";
import { MyRequestsList } from "@/components/requests/MyRequestsList";
import { NewRequestModal } from "@/components/requests/NewRequestModal";
import { RequestDetailPanel } from "@/components/requests/RequestDetailPanel";

function RequestsContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const role = session?.user?.role ?? "staff";
  const fulfiller = isFulfillerRole(role);

  const [showNew, setShowNew] = useState(false);
  // Deep-linkable detail: /requests?open=<id> (notifications link here)
  const openId = searchParams.get("open");

  const setOpenId = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set("open", id);
      else params.delete("open");
      router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return (
    <div>
      <PageHeader
        title="Design Requests"
        description={
          fulfiller
            ? "The creative queue — triage, produce, deliver"
            : "Request design work from the marketing team and track progress"
        }
        primaryAction={{
          label: "New request",
          icon: Plus,
          onClick: () => setShowNew(true),
        }}
      />

      {fulfiller ? (
        <RequestBoard onOpen={setOpenId} />
      ) : (
        <MyRequestsList onOpen={setOpenId} />
      )}

      {showNew && <NewRequestModal onClose={() => setShowNew(false)} />}
      {openId && (
        <RequestDetailPanel
          requestId={openId}
          fulfiller={fulfiller}
          currentUserId={session?.user?.id ?? ""}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

export default function RequestsPage() {
  return (
    <Suspense fallback={null}>
      <RequestsContent />
    </Suspense>
  );
}
