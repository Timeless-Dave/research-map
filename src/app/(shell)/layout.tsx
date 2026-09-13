import { Suspense } from "react";
import ExplorerShell from "@/components/layout/ExplorerShell";

/**
 * `useSearchParams` (URL-owned map selection and directory profile) opts the
 * shell into client-side rendering, so it needs a Suspense boundary to keep the
 * rest of the route prerenderable.
 */
export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
          <span className="text-sm text-gray-400">Loading campus…</span>
        </div>
      }
    >
      <ExplorerShell>{children}</ExplorerShell>
    </Suspense>
  );
}
