import { ProvenProcessView } from "@/components/handbook/ProvenProcessView";

export const metadata = { title: "Amana Proven Process" };

/**
 * Standalone again (2026-10-07) as an Educator's own menu item; the
 * /handbook hub's "Proven Process" tab renders the same view.
 */
export default function AmanaProvenProcessPage() {
  return <ProvenProcessView />;
}
