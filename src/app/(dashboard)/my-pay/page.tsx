import type { Metadata } from "next";
import { MyPayContent } from "@/components/my-pay/MyPayContent";

export const metadata: Metadata = {
  title: "Pay",
};

export default function MyPayPage() {
  return <MyPayContent />;
}
