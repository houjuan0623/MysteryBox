"use client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  INTEREST_LABELS,
  type Box,
  type Tool,
  type PublicConfig,
  type User,
} from "@mysterybox/shared";
import { api, boxTokens, catalogDate, errorMessage, getConfig } from "@/lib/api";
import { Icon } from "@/components/icon";
import { ErrorNotice, PageLoading, Spinner } from "@/components/shell";
export function BoxResults({ id }: { id: string }) {
  const [box, setBox] = useState<Box | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [error, setError] = useState("");
  const [favoriteError, setFavoriteError] = useState("");
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [favoriteBusy, setFavoriteBusy] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [copied, setCopied] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailStatus, setEmailStatus] = useState("");
  const [emailError, setEmailError] = useState("");
  const headers = () => {
    const token = boxTokens()[id];
    return token ? { "x-box-token": token } : undefined;
  };
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [result, catalog, settings] = await Promise.all([
        api<{ box: Box }>(`/boxes/${encodeURIComponent(id)}`, {
          headers: headers(),
        }),
        api<{ tools: Tool[] }>("/catalog"),
        getConfig(),
      ]);
      setBox(result.box);
      setTools(catalog.tools);
      setConfig(settings);
      try {
        const session = await api<{ user: User | null }>("/auth/me");
        setUser(session.user);
        if (session.user) {
          const saved = await api<{ toolIds: string[] }>("/me/favorites");
          setFavorites(saved.toolIds);
        }
      } catch {
        setFavoriteError(
          "Account features are temporarily unavailable. Your box is still ready to explore.",
        );
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [id]);
  async function saveFavorite(toolId: string) {
    if (favoriteBusy) return;
    if (!user) {
      setFavoriteError("Sign in to keep your favorite tools in your collection.");
      return;
    }
    setFavoriteBusy(toolId);
    setFavoriteError("");
    const saved = !favorites.includes(toolId);
    try {
      await api(`/me/favorites/${encodeURIComponent(toolId)}`, {
        method: "PUT",
        body: JSON.stringify({ saved }),
      });
      setFavorites((current) =>
        saved ? [...current, toolId] : current.filter((value) => value !== toolId),
      );
    } catch (err) {
      setFavoriteError(errorMessage(err));
    } finally {
      setFavoriteBusy("");
    }
  }
  async function copyPrompt(toolId: string, prompt: string) {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(toolId);
      window.setTimeout(
        () => setCopied((current) => (current === toolId ? "" : current)),
        2500,
      );
    } catch {
      setFavoriteError(
        "Your browser couldn’t copy the prompt. Select the prompt text and copy it manually.",
      );
    }
  }
  async function sendEmail(event: React.FormEvent) {
    event.preventDefault();
    if (!consent || emailBusy) return;
    setEmailBusy(true);
    setEmailError("");
    setEmailStatus("");
    try {
      const result = await api<{ status: string }>(
        `/boxes/${encodeURIComponent(id)}/email`,
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ email: email.trim(), consent: true }),
        },
      );
      setEmailStatus(
        result.status === "demo"
          ? "Demo email prepared. No email was actually sent."
          : result.status === "sent"
            ? "Your box is on its way. Check your inbox."
            : "Email delivery could not be confirmed. You can still access this box here.",
      );
    } catch (err) {
      setEmailError(errorMessage(err));
    } finally {
      setEmailBusy(false);
    }
  }
  if (loading) return <PageLoading label="Unpacking your discovery…" />;
  if (error || !box)
    return (
      <section className="site-container empty-page">
        <Icon name="box" size={40} />
        <h1>This box needs another look.</h1>
        <ErrorNotice message={error || "The box could not be loaded."} retry={load} />
        <p>
          If you opened this box in another session, sign in to the account that owns it.
        </p>
        <div className="hero-actions">
          <Button
            asChild
            variant="secondary"
            className="h-auto min-h-12 rounded-lg px-5 py-3 text-xs font-semibold gap-3 whitespace-normal bg-secondary text-secondary-foreground hover:bg-secondary/90"
          >
            <Link href="/account">My collection</Link>
          </Button>
          <Link href="/discover" className="text-link">
            Open a new box <Icon name="arrow" />
          </Link>
        </div>
      </section>
    );
  return (
    <>
      <section className="result-header">
        <div className="site-container">
          <Link href="/discover" className="back-link">
            ← Back to discovery
          </Link>
          <div className="result-heading-row">
            <div>
              <div className="eyebrow">
                <Icon name="sparkles" size={16} /> YOUR{" "}
                {box.tier === "premium" ? "PREMIUM" : "FREE"} DISCOVERY
              </div>
              <h1>{box.title}</h1>
              <p>{box.summary}</p>
              <div className="result-tags">
                <span>{INTEREST_LABELS[box.interest]}</span>
                <span>
                  {box.tools.length} {box.tools.length === 1 ? "tool" : "tools"} to
                  explore
                </span>
                <span>
                  {new Date(box.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                {box.generationMode === "demo" && (
                  <span className="demo-tag">Demo recommendations</span>
                )}
              </div>
            </div>
            <div className="result-box-icon">
              <Icon name="box" size={62} />
              <span>OPEN A POSSIBILITY</span>
            </div>
          </div>
        </div>
      </section>
      <div className="site-container results-body">
        <div className="section-heading">
          <div>
            <div className="eyebrow">THE GOOD STUFF INSIDE</div>
            <h2>Meet your next starting point{box.tools.length > 1 ? "s" : ""}.</h2>
          </div>
          <span className="small-muted">Independent tools. Official links.</span>
        </div>
        {favoriteError && (
          <div className="info-notice" role="status">
            {favoriteError} {!user && <Link href="/account">Sign in →</Link>}
          </div>
        )}
        <div className="recommendation-list">
          {box.tools.map((recommendation, index) => {
            const tool = tools.find((item) => item.id === recommendation.toolId);
            return (
              <Card
                className="recommendation flex-row gap-0 rounded-xl p-5 shadow-none sm:gap-6 sm:p-7"
                key={recommendation.toolId}
              >
                <div className="recommendation-number">0{index + 1}</div>
                <div className="recommendation-content">
                  <div className="recommendation-top">
                    <div className="recommendation-identity">
                      <span
                        className={`tool-avatar ${["peach", "lavender", "green"][index % 3]}`}
                      >
                        {tool?.name.slice(0, 2) || "AI"}
                      </span>
                      <div>
                        <span className="tool-category">
                          {tool?.category || "Tool recommendation"}
                        </span>
                        <h3>{tool?.name || recommendation.toolId}</h3>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      className={`h-auto min-h-12 rounded-lg px-5 py-3 text-xs font-semibold gap-3 whitespace-normal min-h-9 px-3 py-2 text-[11px] gap-2 border border-input bg-transparent text-foreground hover:bg-accent ${favorites.includes(recommendation.toolId) ? "is-saved" : ""}`}
                      onClick={() => saveFavorite(recommendation.toolId)}
                      disabled={!!favoriteBusy}
                      aria-pressed={favorites.includes(recommendation.toolId)}
                    >
                      <Icon name="heart" size={16} />
                      {favorites.includes(recommendation.toolId) ? "Saved" : "Save"}
                    </Button>
                  </div>
                  <p className="recommendation-tagline">{tool?.tagline}</p>
                  <div className="recommendation-details">
                    <div>
                      <h4>Why it’s in your box</h4>
                      <p>{recommendation.why}</p>
                    </div>
                    <div>
                      <h4>Make it useful</h4>
                      <p>{recommendation.useCase}</p>
                    </div>
                  </div>
                  <div className="prompt-card">
                    <div className="prompt-heading">
                      <span>
                        <Icon name="sparkles" size={15} />A PROMPT TO GET STARTED
                      </span>
                      <Button
                        variant="ghost"
                        className={`text-button h-auto p-0 text-xs ${copied === recommendation.toolId ? "copy-complete" : ""}`}
                        onClick={() =>
                          copyPrompt(recommendation.toolId, recommendation.prompt)
                        }
                      >
                        <Icon
                          name={copied === recommendation.toolId ? "check" : "copy"}
                          size={15}
                        />
                        <span aria-live="polite">
                          {copied === recommendation.toolId ? "Copied" : "Copy prompt"}
                        </span>
                      </Button>
                    </div>
                    <p>{recommendation.prompt}</p>
                  </div>
                  <details className="use-steps" open>
                    <summary>
                      Try it in a few steps <Icon name="plus" size={16} />
                    </summary>
                    <ol>
                      {recommendation.steps.map((step, i) => (
                        <li key={i}>
                          <span>{i + 1}</span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </details>
                  {tool && (
                    <>
                      <div className="recommendation-bottom">
                        <a
                          className="h-auto min-h-12 rounded-lg px-5 py-3 text-xs font-semibold gap-3 whitespace-normal bg-secondary text-secondary-foreground hover:bg-secondary/90 min-h-9 px-3 py-2 text-[11px] gap-2"
                          href={tool.website}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Visit {tool.name}
                          <Icon name="external" size={15} />
                        </a>
                        <span>{tool.pricingNote}</span>
                      </div>
                      <p className="tool-caveat">
                        {tool.caveat}{" "}
                        <a
                          href={tool.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Official information ↗
                        </a>
                        {tool.reviewedAt
                          ? ` · Catalog reviewed ${catalogDate(tool.reviewedAt)}`
                          : ""}
                      </p>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
        {box.workflow.length > 0 && (
          <section className="workflow-panel">
            <div className="workflow-intro">
              <div className="eyebrow">
                <Icon name="sparkles" size={16} />
                CONNECT THE DOTS
              </div>
              <h2>Here’s how it comes together.</h2>
              <p>A practical path from idea to action. Adapt it to fit how you work.</p>
            </div>
            <ol className="workflow-steps">
              {box.workflow.map((step, index) => (
                <li key={index}>
                  <span className="workflow-number">{index + 1}</span>
                  <div>
                    <span className="workflow-tool">
                      {tools.find((tool) => tool.id === step.toolId)?.name || step.toolId}
                    </span>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
        <section className="keep-box">
          <div>
            <span className="note-icon peach">
              <Icon name="mail" size={24} />
            </span>
            <h2>A discovery worth keeping.</h2>
            <p>
              Email yourself this box, or{" "}
              <Link href="/account">sign in to keep it in your collection</Link>.
            </p>
            {config?.emailMode === "demo" && (
              <span className="demo-tag">Demo email · nothing will be sent</span>
            )}
          </div>
          <form onSubmit={sendEmail}>
            <label htmlFor="box-email">Your email</label>
            <div className="email-input-row">
              <Input
                className="h-12 rounded-lg bg-card px-3 text-sm"
                id="box-email"
                type="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={emailBusy}
              />
              <Button
                variant="ghost"
                className="h-auto min-h-12 rounded-lg px-5 py-3 text-xs font-semibold gap-3 whitespace-normal bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={emailBusy || !consent}
              >
                {emailBusy ? (
                  <Spinner label="Sending…" />
                ) : (
                  <>
                    <Icon name="mail" size={17} />
                    Send my box
                  </>
                )}
              </Button>
            </div>
            <label className="checkbox-label" htmlFor="email-consent">
              <Checkbox
                id="email-consent"
                className="mt-0.5 shrink-0"
                checked={consent}
                onCheckedChange={(value) => setConsent(value === true)}
                required
              />
              <span>
                Send this box to the email above. This request is for a single email.
              </span>
            </label>
            {emailStatus && (
              <p className="success-message" role="status">
                {emailStatus}
              </p>
            )}
            {emailError && <ErrorNotice message={emailError} />}
          </form>
        </section>
        <div className="results-bottom-note">
          <p>
            AI recommendations can be imperfect. Verify features, prices, and terms on the
            official tool websites before signing up.
          </p>
          <Link href="/discover" className="text-link">
            A different direction? Open another box <Icon name="arrow" size={17} />
          </Link>
        </div>
      </div>
    </>
  );
}
