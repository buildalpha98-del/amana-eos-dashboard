import { Suspense } from "react";
import QrCodesContent from "@/components/marketing/qr-codes/QrCodesContent";

export const metadata = {
  title: "QR Hub — Amana EOS",
};

export default function MarketingQrCodesPage() {
  return (
    <Suspense fallback={null}>
      <QrCodesContent />
    </Suspense>
  );
}
