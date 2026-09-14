"use client";

/**
 * /contracts/[id] — single contract detail.
 *
 * This route did not exist until 2026-09-14, yet two links on the staff
 * profile ("View in Contracts" and "Open contract editor", EmploymentTab)
 * had pointed at it for months. Contract detail was only ever an inline
 * expanding row inside ContractsTable, so every one of those links 404'd.
 *
 * Rather than rewrite the links to a query-param deep link, the page now
 * exists — an addressable contract is worth having anyway (you can send
 * one to a colleague, and the staff profile can link straight at it).
 *
 * Admins land here. A staff member who follows a link to their own
 * contract is sent to /my-contract instead, which is the read-and-sign
 * surface built for them.
 */

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, Shield } from "lucide-react";
import type { Role } from "@prisma/client";
import { hasMinRole } from "@/lib/permissions";
import {
  useContract,
  useContracts,
  type ContractData,
} from "@/hooks/useContracts";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ContractDetailPanel } from "@/components/contracts/ContractDetailPanel";
import { ContractTermsReader } from "@/components/contracts/ContractTermsReader";
import { SupersedeContractModal } from "@/components/contracts/SupersedeContractModal";
import { TerminateContractDialog } from "@/components/contracts/TerminateContractDialog";
import { StatusBadge } from "@/components/contracts/badges";
import {
  CONTRACT_TYPE_LABELS,
  type UserOption,
} from "@/components/contracts/constants";
import { fetchApi } from "@/lib/fetch-api";

export default function ContractDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const role = (session?.user?.role as Role) || undefined;
  const isAdmin = hasMinRole(role, "admin");

  const { data: contract, isLoading, error } = useContract(isAdmin ? id : null);

  // Sibling contracts for the same staff member — ContractDetailPanel walks
  // this list to draw the supersede chain. Only fetched once we know whose
  // contract this is, so it's a second round-trip by design.
  const { data: siblings = [] } = useContracts(
    contract ? { userId: contract.userId } : undefined,
  );

  // SupersedeContractModal renders a (disabled) staff picker, so it needs
  // the user list even though a contract can never move between staff.
  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: () => fetchApi<UserOption[]>("/api/users"),
    retry: 2,
    staleTime: 60_000,
    enabled: isAdmin,
  });

  const [supersedeTarget, setSupersedeTarget] = useState<ContractData | null>(null);
  const [terminateTarget, setTerminateTarget] = useState<ContractData | null>(null);

  // The panel wants plain ContractData; ContractDetail is a superset, and
  // the sibling list already holds this contract's own row once loaded.
  const allContracts = useMemo<ContractData[]>(() => {
    if (!contract) return [];
    return siblings.some((c) => c.id === contract.id)
      ? siblings
      : [contract, ...siblings];
  }, [contract, siblings]);

  if (sessionStatus === "loading") {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Staff following a link to their own contract get the surface built for
  // them rather than an access-denied wall.
  if (!isAdmin) {
    router.replace("/my-contract");
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center mb-4">
          <Shield className="w-8 h-8 text-muted" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-1">
          Taking you to your contract
        </h3>
        <p className="text-sm text-muted max-w-sm">
          Contract management is restricted to owners and administrators.
          Your own contract lives in{" "}
          <Link href="/my-contract" className="text-brand hover:underline">
            My Contract
          </Link>
          .
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="max-w-4xl mx-auto">
        <Link
          href="/contracts"
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Contracts
        </Link>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-muted" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            Contract not found
          </h3>
          <p className="text-sm text-muted max-w-sm">
            This contract may have been deleted, or you may not have permission
            to view it.
          </p>
        </div>
      </div>
    );
  }

  const typeLabel =
    CONTRACT_TYPE_LABELS[contract.contractType] || contract.contractType;

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        href="/contracts"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Contracts
      </Link>

      <PageHeader
        title={contract.user.name}
        description={`${typeLabel} contract`}
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <StatusBadge status={contract.status} />
        <Link
          href={`/staff/${contract.userId}`}
          className="text-sm text-brand hover:underline"
        >
          View staff profile
        </Link>
      </div>

      {/* Backfill for the long tail of quick-uploaded contracts sitting at
          $0.00/hr, where the real rate is inside the attached PDF. */}
      <div className="mb-4">
        <ContractTermsReader
          contractId={contract.id}
          currentPayRate={contract.payRate}
          hasDocument={!!contract.documentUrl}
        />
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <ContractDetailPanel
          contract={contract}
          allContracts={allContracts}
          onSupersede={setSupersedeTarget}
          onTerminate={setTerminateTarget}
          canEdit
        />
      </div>

      {supersedeTarget && (
        <SupersedeContractModal
          users={users}
          previousContract={supersedeTarget}
          onClose={() => setSupersedeTarget(null)}
        />
      )}
      {terminateTarget && (
        <TerminateContractDialog
          contract={terminateTarget}
          onClose={() => setTerminateTarget(null)}
        />
      )}
    </div>
  );
}
