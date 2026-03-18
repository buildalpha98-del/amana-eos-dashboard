import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Enrolment Form — Amana OSHC",
  description: "Complete your child's enrolment at Amana Out of School Hours Care.",
};

export default function EnrolLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#001824] via-[#003344] to-[#0A5E7E]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#002E3D]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <img src="/logo-full-white.svg" alt="Amana OSHC" className="h-8" />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-8 pb-24">
        {children}
      </main>

      {/* Footer */}
      <footer className="text-center text-white/40 text-xs py-6">
        Amana OSHC &copy; {new Date().getFullYear()}. All rights reserved.
      </footer>
    </div>
  );
}
