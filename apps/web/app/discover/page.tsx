import { Suspense } from "react";
import type { Metadata } from "next";
import { DiscoverForm } from "./discover-form";
import { Catalog } from "@/components/catalog";
import { PageLoading } from "@/components/shell";
export const metadata: Metadata = { title: "Discover your box" };
export default function DiscoverPage() {
  return (
    <>
      <Suspense fallback={<PageLoading />}>
        <DiscoverForm />
      </Suspense>
      <Catalog />
    </>
  );
}
