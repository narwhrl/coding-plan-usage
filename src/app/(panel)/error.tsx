"use client";

import type React from "react";
import { RouteError } from "@/components/route-error";

export default function PanelError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}): React.ReactElement {
  return <RouteError retry={retry} />;
}
