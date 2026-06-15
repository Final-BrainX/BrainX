"use client";

import { BrainXProvider } from "@/components/brainx-provider";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <BrainXProvider>{children}</BrainXProvider>;
}
