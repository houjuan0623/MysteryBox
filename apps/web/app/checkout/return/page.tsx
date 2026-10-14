import { Suspense } from "react";
import { CheckoutReturn } from "./return-client";
import { PageLoading } from "@/components/shell";
export default function CheckoutReturnPage() {
  return (
    <Suspense fallback={<PageLoading label="Getting your discovery ready…" />}>
      <CheckoutReturn />
    </Suspense>
  );
}
