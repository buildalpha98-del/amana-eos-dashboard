"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { MyTrainingContent } from "./MyTrainingContent";

export default function MyTrainingPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <PageHeader
        title="My Training"
        description="Your induction and ongoing training. Complete each course to stay ready for work."
      />
      <div className="mt-6">
        <MyTrainingContent />
      </div>
    </div>
  );
}
