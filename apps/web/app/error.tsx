"use client";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="site-container empty-page">
      <Icon name="box" size={42} />
      <h1>Let’s give that another try.</h1>
      <p>
        This page couldn’t load. Your saved discoveries are still worth coming back to.
      </p>
      <Button
        variant="ghost"
        className="h-auto min-h-12 rounded-lg px-5 py-3 text-xs font-semibold gap-3 whitespace-normal bg-primary text-primary-foreground hover:bg-primary/90"
        onClick={reset}
      >
        Try again <Icon name="arrow" />
      </Button>
    </section>
  );
}
