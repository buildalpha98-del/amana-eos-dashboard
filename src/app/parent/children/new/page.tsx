"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParentProfile } from "@/hooks/useParentPortal";
import { EnrolmentWizard } from "@/components/enrol/EnrolmentWizard";
import { Skeleton } from "@/components/ui/Skeleton";
import { toast } from "@/hooks/useToast";
import type { ParentDetails } from "@/components/enrol/types";

export default function NewChildPage() {
  const router = useRouter();
  const { data: profile, isLoading } = useParentProfile();

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-[400px] w-full rounded-xl" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-4">
        <Link
          href="/parent/children"
          className="inline-flex items-center gap-1 text-sm text-[#004E64] hover:text-[#0A7E9E] font-medium transition-colors min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to children
        </Link>
        <div className="bg-white rounded-xl p-8 text-center shadow-sm border border-[#e8e4df]">
          <p className="text-[#7c7c8a] text-sm">
            Unable to load your profile. Please try again.
          </p>
        </div>
      </div>
    );
  }

  // Map profile to ParentDetails shape for prefill
  const parentPrefill: ParentDetails = {
    firstName: profile.firstName,
    surname: profile.lastName,
    dob: "",
    email: profile.email,
    mobile: profile.phone ?? "",
    street: profile.address?.street ?? "",
    suburb: profile.address?.suburb ?? "",
    state: profile.address?.state ?? "",
    postcode: profile.address?.postcode ?? "",
    relationship: "",
    occupation: "",
    workplace: "",
    workPhone: "",
    crn: "",
    soleCustody: null,
  };

  const handleComplete = (result: { token: string; childNames: string }) => {
    toast({
      description: `Enrolment submitted for ${result.childNames}! We will be in touch within 2 business days.`,
    });
    router.push("/parent/children");
  };

  return (
    <div className="space-y-5">
      <Link
        href="/parent/children"
        className="inline-flex items-center gap-1 text-sm text-[#004E64] hover:text-[#0A7E9E] font-medium transition-colors min-h-[44px]"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to children
      </Link>

      <div>
        <h1 className="text-2xl font-heading font-bold text-[#1a1a2e]">
          Enrol a Sibling
        </h1>
        <p className="text-sm text-[#7c7c8a] mt-1">
          Your details are pre-filled. Just add the new child&apos;s information.
        </p>
      </div>

      <EnrolmentWizard
        parentPrefill={parentPrefill}
        skipSteps={[1]}
        onComplete={handleComplete}
        variant="portal"
      />
    </div>
  );
}
