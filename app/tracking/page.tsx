import { Suspense } from "react";
import { TrackingClient } from "@/components/tracking-client";

export default function TrackingPage() {
  return <Suspense fallback={<div className="wrap loading-page">Loading tracking preview…</div>}><TrackingClient /></Suspense>;
}
