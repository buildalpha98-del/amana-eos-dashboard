"use client";

import { useV2Flag } from "./utils/useV2Flag";
import ParentHomeV1 from "./HomeV1";
import ParentHomeV2 from "./HomeV2";

export default function ParentHome() {
  const v2 = useV2Flag();
  return v2 ? <ParentHomeV2 /> : <ParentHomeV1 />;
}
