"use client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicConfig } from "@mysterybox/shared";
import { getConfig, price } from "@/lib/api";
import { Icon } from "./icon";
export function HomePricing() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch(() => {});
  }, []);
  return (
    <section className="site-container section pricing-section">
      <div className="center-heading">
        <div className="eyebrow">JUST ENOUGH TO GET GOING</div>
        <h2>Start small. Explore a little further.</h2>
        <p>One useful discovery, or a whole new way to work.</p>
      </div>
      <div className="pricing-grid">
        <Card className="price-card gap-0 rounded-xl p-8 shadow-none">
          <div className="price-card-label">
            <span className="note-icon peach">
              <Icon name="box" />
            </span>
            <span>THE FIRST LOOK</span>
          </div>
          <h3>Free discovery</h3>
          <p>Meet a tool that fits your next step.</p>
          <div className="price-value">
            $0<span> / a little inspiration</span>
          </div>
          <ul className="check-list">
            <li>
              <Icon name="check" />1 tool matched to your interest
            </li>
            <li>
              <Icon name="check" />
              Why it fits and how to get started
            </li>
            <li>
              <Icon name="check" />A practical prompt to make it yours
            </li>
          </ul>
          <Button
            asChild
            variant="outline"
            className="h-auto min-h-12 rounded-lg px-5 py-3 text-xs font-semibold gap-3 whitespace-normal border border-input bg-transparent text-foreground hover:bg-accent w-full"
          >
            <Link href="/discover?tier=free">
              Open a free box <Icon name="arrow" />
            </Link>
          </Button>
        </Card>
        <Card className="price-card premium-card gap-0 rounded-xl p-8 shadow-none">
          <Badge className="premium-badge rounded-full bg-primary text-primary-foreground">
            A LITTLE MORE POSSIBILITY
          </Badge>
          <div className="price-card-label">
            <span className="note-icon orange">
              <Icon name="sparkles" />
            </span>
            <span>THE DEEPER DIVE</span>
          </div>
          <h3>Premium discovery</h3>
          <p>Three tools. One connected starting point.</p>
          <div className="price-value">
            {config ? price(config.premiumPriceCents) : "See price"}
            <span> / one box, one-time</span>
          </div>
          <ul className="check-list">
            <li>
              <Icon name="check" />3 complementary tool recommendations
            </li>
            <li>
              <Icon name="check" />A practical workflow with clear steps
            </li>
            <li>
              <Icon name="check" />
              Copy-ready prompts for each tool
            </li>
          </ul>
          <Button
            asChild
            variant="default"
            className="h-auto min-h-12 rounded-lg px-5 py-3 text-xs font-semibold gap-3 whitespace-normal bg-primary text-primary-foreground hover:bg-primary/90 w-full"
          >
            <Link href="/discover?tier=premium">
              Explore premium <Icon name="arrow" />
            </Link>
          </Button>
        </Card>
      </div>
      <p className="pricing-fine">
        {config?.paymentMode === "demo" ? "Demo checkout only. No actual charge. " : ""}
        You’re purchasing curation. Third-party tool subscriptions and usage fees are not
        included.
      </p>
    </section>
  );
}
