import { Suspense } from "react";
import EnquireForm from "./EnquireForm";

export const metadata = {
  title: "Enquire — Amana OSHC",
  description: "Send Amana OSHC an enquiry about our before / after school care programme.",
};

export default function ParentEnquirePage() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-4">
      <Suspense
        fallback={
          <div className="w-full max-w-md rounded-2xl border-2 border-border bg-card p-8 shadow-sm">
            <div className="h-6 w-2/3 bg-border rounded animate-pulse mb-4" />
            <div className="h-4 w-full bg-border rounded animate-pulse" />
          </div>
        }
      >
        <EnquireForm />
      </Suspense>
    </main>
  );
}
