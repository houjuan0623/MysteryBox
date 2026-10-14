"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import {
  INTERESTS,
  INTEREST_LABELS,
  type Tool,
  type Interest,
} from "@mysterybox/shared";
import { api, errorMessage } from "@/lib/api";
import { Icon } from "./icon";
import { ToolCard } from "./tool-card";
import { ErrorNotice, Spinner } from "./shell";
export function Catalog() {
  const [interest, setInterest] = useState<Interest | "">("");
  const [query, setQuery] = useState("");
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (interest) params.set("interest", interest);
      if (query.trim()) params.set("q", query.trim());
      api<{ tools: Tool[] }>(`/catalog?${params}`, { signal: abort.signal })
        .then((data) => setTools(data.tools))
        .catch((err) => {
          if (!abort.signal.aborted) setError(errorMessage(err));
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [interest, query, retry]);
  return (
    <section className="site-container section catalog-section" id="catalog">
      <div className="section-heading">
        <div>
          <div className="eyebrow">A PEEK AT THE POSSIBILITIES</div>
          <h2>The tool library.</h2>
        </div>
        <p>
          Browse the tools behind the boxes.
          <br />
          Choose what’s useful. Leave the rest.
        </p>
      </div>
      <div className="catalog-toolbar">
        <div className="filter-tabs" aria-label="Filter tools by interest">
          <Button
            variant="ghost"
            onClick={() => setInterest("")}
            className={!interest ? "active" : ""}
            aria-pressed={!interest}
          >
            All tools
          </Button>
          {INTERESTS.map((id) => (
            <Button
              variant="ghost"
              key={id}
              className={interest === id ? "active" : ""}
              onClick={() => setInterest(id)}
              aria-pressed={interest === id}
            >
              {INTEREST_LABELS[id]}
            </Button>
          ))}
        </div>
        <label className="search-input">
          <Icon name="search" size={18} />
          <span className="sr-only">Search tools</span>
          <Input
            className="h-auto border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
            type="search"
            maxLength={100}
            placeholder="Find a tool…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      {error ? (
        <ErrorNotice message={error} retry={() => setRetry((v) => v + 1)} />
      ) : loading ? (
        <div className="catalog-loading">
          <Spinner label="Exploring the library…" />
        </div>
      ) : tools.length ? (
        <>
          <div className="tool-grid">
            {tools.map((tool) => (
              <ToolCard tool={tool} key={tool.id} />
            ))}
          </div>
          <p className="catalog-disclaimer">
            Tool information is a starting point, not a live price quote. Check
            each official website for current pricing, features, and terms.
          </p>
        </>
      ) : (
        <div className="empty-state">
          <Icon name="search" size={28} />
          <h3>No tools found just yet.</h3>
          <p>Try another search or interest.</p>
          <Button
            variant="ghost"
            className="text-button h-auto p-0 text-xs"
            onClick={() => {
              setQuery("");
              setInterest("");
            }}
          >
            Clear filters <Icon name="arrow" size={16} />
          </Button>
        </div>
      )}
    </section>
  );
}
