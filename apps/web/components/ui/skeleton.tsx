// Source: https://ui.shadcn.com/r/styles/new-york-v4/skeleton.json (shadcn/ui, MIT). Theme customized at application level.
import { cn } from "cn";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-accent", className)}
      {...props}
    />
  );
}

export { Skeleton };
