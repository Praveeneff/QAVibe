import { Suspense } from "react";
import TestCasesClient from "./TestCasesClient";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function TestCasesPage() {
  return (
    <ProtectedRoute>
      <main style={{ minHeight: "calc(100vh - 45px)" }}>
        <Suspense>
          <TestCasesClient />
        </Suspense>
      </main>
    </ProtectedRoute>
  );
}
