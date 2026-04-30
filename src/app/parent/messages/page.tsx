"use client";

import { useV2Flag } from "../utils/useV2Flag";
import MessagesV1 from "./MessagesV1";
import MessagesV2 from "./MessagesV2";

export default function MessagesPage() {
  const v2 = useV2Flag();
  return v2 ? <MessagesV2 /> : <MessagesV1 />;
}
