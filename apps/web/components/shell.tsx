"use client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { PublicConfig } from "@mysterybox/shared";
import { getConfig } from "@/lib/api";
import { Icon } from "./icon";
export function Header() {
  const pathname = usePathname();
  return (
    <header className="header">
      <div className="site-container nav">
        <Link href="/" className="brand" aria-label="MysteryBox home">
          <span className="brand-mark">
            <Icon name="box" size={23} />
          </span>
          MysteryBox<span className="brand-period">.</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link
            aria-current={pathname === "/discover" ? "page" : undefined}
            href="/discover"
          >
            Discover
          </Link>
          <Link href="/discover#catalog" className="nav-catalog">
            Tool library
          </Link>
          <Link
            aria-current={pathname === "/account" ? "page" : undefined}
            href="/account"
            className="nav-account"
          >
            <Icon name="user" size={17} />
            <span>My collection</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
export function ModeBanner() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch(() => {});
  }, []);
  return config &&
    (config.demo ||
      config.aiMode === "demo" ||
      config.paymentMode === "demo" ||
      config.emailMode === "demo") ? (
    <div className="mode-banner">
      <span className="status-dot" />
      <strong>Demo experience</strong>
      <span>
        {config.paymentMode === "demo"
          ? "Payments are simulated. No money is charged."
          : config.paymentEnvironment === "sandbox"
            ? "PayPal sandbox. No real money is charged."
            : "Live PayPal payments enabled."}{" "}
        {config.aiMode === "demo"
          ? "Recommendations use a local demo engine."
          : "AI-generated recommendations."}{" "}
        {config.emailMode === "demo" ? "Email delivery is simulated." : ""}
      </span>
    </div>
  ) : null;
}
export function Footer() {
  return (
    <footer className="footer">
      <div className="site-container footer-main">
        <div>
          <Link href="/" className="brand">
            <span className="brand-mark">
              <Icon name="box" size={20} />
            </span>
            MysteryBox<span className="brand-period">.</span>
          </Link>
          <p>A little curiosity. A useful next step.</p>
        </div>
        <div className="footer-links">
          <Link href="/discover">Discover a box</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </div>
      </div>
      <div className="site-container footer-bottom">
        <span>Thoughtfully curated. Independently explored.</span>
        <span>Tool subscriptions are purchased separately.</span>
      </div>
    </footer>
  );
}
export function ErrorNotice({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <Alert
      variant="destructive"
      className="error-notice flex flex-col gap-2 rounded-lg border-destructive/25 bg-destructive/5 px-4 py-3 shadow-none"
    >
      <AlertDescription className="text-xs leading-relaxed text-destructive">
        {message}
      </AlertDescription>
      {retry && (
        <Button
          variant="link"
          className="h-auto justify-start p-0 text-xs text-destructive"
          onClick={retry}
        >
          Try again <Icon name="arrow" size={15} />
        </Button>
      )}
    </Alert>
  );
}
export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="loading-inline" role="status">
      <span className="spinner" />
      <span>{label}</span>
    </span>
  );
}
export function PageLoading({
  label = "Finding something good…",
}: {
  label?: string;
}) {
  return (
    <div className="page-loading">
      <span className="loading-box">
        <Icon name="box" size={34} />
      </span>
      <Spinner label={label} />
    </div>
  );
}
