import type { Metadata } from "next";
import { HelpCentreContent } from "./HelpCentreContent";

export const metadata: Metadata = {
  title: "Help Centre — Amana EOS",
};

export default function HelpCentrePage() {
  return <HelpCentreContent />;
}
