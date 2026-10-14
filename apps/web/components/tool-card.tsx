import type { Tool } from "@mysterybox/shared";
import { Icon } from "./icon";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
const colors = ["lavender", "green", "peach", "yellow"];
export function ToolCard({
  tool,
  saved,
  onFavorite,
  busy = false,
}: {
  tool: Tool;
  saved?: boolean;
  onFavorite?: (id: string, saved: boolean) => void;
  busy?: boolean;
}) {
  const color = colors[tool.name.charCodeAt(0) % colors.length];
  return (
    <Card className="tool-card gap-0 rounded-xl p-6 shadow-none">
      <CardHeader className="gap-0 p-0">
        <div className="tool-card-top">
          <span className={`tool-avatar ${color}`}>{tool.name.slice(0, 2)}</span>
          <span className="tool-category">{tool.category}</span>
          {onFavorite && (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className={`favorite-button rounded-full ${saved ? "is-saved bg-accent" : ""}`}
              onClick={() => onFavorite(tool.id, !saved)}
              disabled={busy}
              aria-label={`${saved ? "Remove" : "Save"} ${tool.name}${saved ? " from" : " to"} favorites`}
              aria-pressed={saved || false}
            >
              <Icon name="heart" size={19} />
            </Button>
          )}
        </div>
        <CardTitle className="text-lg leading-snug">{tool.name}</CardTitle>
        <CardDescription className="mt-1 text-xs leading-relaxed">
          {tool.tagline}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <p className="tool-description">{tool.description}</p>
        <div className="tool-capabilities">
          {tool.capabilities.slice(0, 3).map((cap) => (
            <Badge
              key={cap}
              variant="outline"
              className="rounded-md bg-muted px-2 py-1 text-[9px] font-normal leading-normal text-muted-foreground"
            >
              {cap}
            </Badge>
          ))}
        </div>
      </CardContent>
      <CardFooter className="tool-card-bottom p-0 pt-4">
        <span>{tool.pricingNote}</span>
        <a
          href={tool.website}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link"
          aria-label={`Visit ${tool.name} official website (opens in a new tab)`}
        >
          Explore <Icon name="external" size={14} />
        </a>
      </CardFooter>
    </Card>
  );
}
