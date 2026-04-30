"use client";

import { useV2Flag } from "../../utils/useV2Flag";
import ChildDetailV1 from "./ChildDetailV1";
import ChildDetailV2 from "./ChildDetailV2";

export default function ChildDetailPage() {
  const v2 = useV2Flag();
  return v2 ? <ChildDetailV2 /> : <ChildDetailV1 />;
}
