"use client";

import AmanaHandbookPanel from "@/components/shared/AmanaHandbookPanel";
import {
  AmanaContentProvider,
  EditBar,
} from "@/components/shared/amana-content";

export default function HandbookPage() {
  return (
    <AmanaContentProvider contentKey="amana-handbook">
      <div
        className="-mx-4 -mt-4 -mb-20 md:-mx-8 md:-mt-8 md:-mb-8 h-[calc(100dvh-8rem)] md:h-[calc(100dvh-4rem)] overflow-hidden"
        style={{ position: "relative" }}
      >
        <EditBar />
        <AmanaHandbookPanel />
      </div>
    </AmanaContentProvider>
  );
}
