"use client";
import { useState, useSyncExternalStore } from "react";
import {
  analyticsPreference,
  analyticsServerSnapshot,
  setAnalyticsAllowed,
  subscribeAnalytics,
} from "@/lib/analytics";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
export function AnalyticsPreferences() {
  // SSR 还不知道浏览器偏好，不能先展示“已关闭”再在 hydration 后自动改成开启。
  const preference = useSyncExternalStore(
    subscribeAnalytics,
    analyticsPreference,
    analyticsServerSnapshot,
  );
  const loading = preference === "loading";
  const enabled = preference === "enabled";
  const dnt = preference === "do-not-track";
  const unavailable = preference === "unavailable";
  const [error, setError] = useState("");
  return (
    <Card
      className="mt-7 gap-4 rounded-xl border-border bg-card py-6 shadow-none"
      aria-busy={loading}
    >
      <CardHeader>
        <CardTitle className="text-base">Your analytics preference</CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          Optional first-party usage analytics help us understand which pages and
          discovery flows are used. A random session identifier is kept only in this tab.
          We don’t use third-party trackers or device fingerprints.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label
          htmlFor="analytics-consent"
          className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed"
        >
          <Checkbox
            id="analytics-consent"
            className="mt-1"
            checked={enabled}
            disabled={loading || dnt || unavailable}
            onCheckedChange={(value) => {
              setError(
                setAnalyticsAllowed(value === true)
                  ? ""
                  : "Analytics is off for now, but your browser couldn’t save this preference for future visits.",
              );
            }}
          />
          <span>Allow first-party usage analytics for this browser</span>
        </label>
        <p className="text-xs leading-relaxed text-muted-foreground" role="status">
          {loading
            ? "Loading your saved analytics preference…"
            : dnt
              ? "Your browser’s Do Not Track preference is enabled, so analytics is off."
              : unavailable
                ? "Your browser blocks preference storage, so analytics is off."
                : enabled
                  ? "Analytics is enabled. You can turn it off here at any time."
                  : "Analytics is off. Your box, sign-in, and checkout features still work."}
        </p>
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
