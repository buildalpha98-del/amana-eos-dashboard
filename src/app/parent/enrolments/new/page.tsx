"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SiblingEnrolmentForm } from "@/components/portal/SiblingEnrolmentForm";

export default function NewSiblingEnrolmentPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/parent/enrolments"
          className="inline-flex items-center gap-1 text-xs text-[#7c7c8a] hover:text-[#004E64] mb-2 min-h-[44px]"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Enrolments
        </Link>
        <h1 className="text-xl font-heading font-bold text-[#1a1a2e]">
          Enrol a Sibling
        </h1>
        <p className="text-sm text-[#7c7c8a] mt-0.5">
          Complete the form below to enrol a sibling at your child&apos;s service.
        </p>
      </div>

      <SiblingEnrolmentForm />
    </div>
  );
}
