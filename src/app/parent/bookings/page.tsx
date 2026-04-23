"use client";

import { useV2Flag } from "../utils/useV2Flag";
import BookingsV1 from "./BookingsV1";
import BookingsV2 from "./BookingsV2";

export default function BookingsPage() {
  const v2 = useV2Flag();
  return v2 ? <BookingsV2 /> : <BookingsV1 />;
}
