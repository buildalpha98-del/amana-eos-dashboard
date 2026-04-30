"use client";

import { useV2Flag } from "../../utils/useV2Flag";
import ThreadV1 from "./ThreadV1";
import ThreadV2 from "./ThreadV2";

export default function ConversationDetailPage() {
  const v2 = useV2Flag();
  return v2 ? <ThreadV2 /> : <ThreadV1 />;
}
