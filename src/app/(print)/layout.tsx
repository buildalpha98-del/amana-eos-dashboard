import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * Print route group — no sidebar, no top bar, no PWA chrome.
 *
 * Pages under `(print)/...` render a clean white surface that's already
 * print-ready in screen mode and prints cleanly when the user hits Cmd+P
 * (the global `print.css` further hides anything tagged `.no-print`).
 *
 * Auth is enforced here at the layout boundary so every print page below
 * inherits the redirect-to-login behaviour without re-implementing it.
 */
export default async function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-[210mm] px-6 py-8 print:p-0">
        {children}
      </div>
    </div>
  );
}
