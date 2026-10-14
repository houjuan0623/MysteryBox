import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Icon } from "@/components/icon";
export default function NotFound() {
  return (
    <section className="site-container empty-page">
      <Icon name="box" size={46} />
      <div className="eyebrow">A LITTLE DETOUR</div>
      <h1>This one’s still a mystery.</h1>
      <p>We couldn’t find that page. There’s plenty more to discover.</p>
      <Button
        asChild
        variant="default"
        className="h-auto min-h-12 rounded-lg px-5 py-3 text-xs font-semibold gap-3 whitespace-normal bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <Link href="/discover">
          Back to discovery <Icon name="arrow" />
        </Link>
      </Button>
    </section>
  );
}
