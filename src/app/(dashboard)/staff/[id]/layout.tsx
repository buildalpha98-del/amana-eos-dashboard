/**
 * Staff profile layout.
 *
 * 2026-06-04: stripped the sticky top-of-page header that duplicated the
 * big StaffProfileHeader card directly below. The two stacked rows
 * ("← Back  AF  Name  Role  /  ← Back to Team  Avatar  Name…") read as
 * a UI bug. Daniel wanted only the lower card kept — that's the one
 * with quick actions, status pill, contact details. We still keep the
 * page max-width / outer container concerns here so the layout file
 * earns its keep.
 */

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function StaffProfileLayout({ children }: LayoutProps) {
  return <div className="max-w-6xl mx-auto">{children}</div>;
}
