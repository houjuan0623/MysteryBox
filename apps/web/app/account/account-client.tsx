"use client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  INTEREST_LABELS,
  type Box,
  type Tool,
  type User,
} from "@mysterybox/shared";
import { api, boxTokens, clearRequestKey, errorMessage } from "@/lib/api";
import { Icon } from "@/components/icon";
import { ErrorNotice, PageLoading, Spinner } from "@/components/shell";
import { ToolCard } from "@/components/tool-card";
export function AccountClient() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [demoCode, setDemoCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<Tool[]>([]);
  const [tab, setTab] = useState<"boxes" | "favorites">("boxes");
  const [favoriteBusy, setFavoriteBusy] = useState("");
  const busyRef = useRef(false);
  const [claimNotice, setClaimNotice] = useState("");
  async function loadCollection() {
    // 登录后把本浏览器里持有访问令牌的盒子关联到自己的账户；单个认领失败不阻塞其他历史记录。
    const claims = Object.entries(boxTokens());
    const results = await Promise.allSettled(
      claims.map(([boxId, accessToken]) =>
        api("/me/claim-box", {
          method: "POST",
          body: JSON.stringify({ boxId, accessToken }),
        }),
      ),
    );
    if (results.some((result) => result.status === "rejected"))
      setClaimNotice(
        "Some discoveries from this browser couldn’t be added to your account. You can still try their original links in this session.",
      );
    const [history, favorites, tools] = await Promise.all([
      api<{ boxes: Box[] }>("/me/boxes"),
      api<{ toolIds: string[] }>("/me/favorites"),
      api<{ tools: Tool[] }>("/catalog"),
    ]);
    setBoxes(history.boxes);
    setFavoriteIds(favorites.toolIds);
    setCatalog(tools.tools);
  }
  async function initialize() {
    setLoading(true);
    setError("");
    try {
      const session = await api<{ user: User | null }>("/auth/me");
      setUser(session.user);
      if (session.user) await loadCollection();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void initialize();
  }, []);
  async function requestCode(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        challengeId: string;
        developmentCode?: string;
      }>("/auth/request-code", {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setChallenge(result.challengeId);
      setDemoCode(result.developmentCode || "");
      setCode("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ user: User }>("/auth/verify-code", {
        method: "POST",
        body: JSON.stringify({ challengeId: challenge, code: code.trim() }),
      });
      setUser(result.user);
      clearRequestKey("free");
      clearRequestKey("checkout");
      setCode("");
      setDemoCode("");
      setChallenge("");
      await loadCollection();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await api("/auth/logout", { method: "POST", body: "{}" });
      setUser(null);
      clearRequestKey("free");
      clearRequestKey("checkout");
      setBoxes([]);
      setFavoriteIds([]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function favorite(toolId: string, saved: boolean) {
    if (favoriteBusy) return;
    setFavoriteBusy(toolId);
    setError("");
    try {
      await api(`/me/favorites/${encodeURIComponent(toolId)}`, {
        method: "PUT",
        body: JSON.stringify({ saved }),
      });
      setFavoriteIds((current) =>
        saved ? [...current, toolId] : current.filter((id) => id !== toolId),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setFavoriteBusy("");
    }
  }
  if (loading) return <PageLoading label="Opening your collection…" />;
  if (!user)
    return (
      <section className="site-container account-signin">
        <div className="signin-story">
          <div className="eyebrow">KEEP THE GOOD FINDS</div>
          <h1>
            A home for your
            <br />
            <em>little discoveries.</em>
          </h1>
          <p>
            Your boxes, favorite tools, and next good ideas. All in one place.
          </p>
          <div className="signin-mini-box">
            <Icon name="box" size={58} />
            <span>
              Good things
              <br />
              are worth keeping.
            </span>
            <span className="signin-star">✦</span>
          </div>
          <ul className="check-list">
            <li>
              <Icon name="check" />
              Come back to your past discoveries
            </li>
            <li>
              <Icon name="check" />
              Save the tools you want to try
            </li>
            <li>
              <Icon name="check" />
              Bring boxes from this browser into your collection
            </li>
          </ul>
        </div>
        <Card className="signin-card block gap-0 rounded-2xl p-7 shadow-sm sm:p-8">
          <span className="note-icon peach">
            <Icon name="user" size={24} />
          </span>
          <h2>
            {challenge
              ? demoCode
                ? "Your demo sign-in code."
                : "Check your inbox."
              : "Make yourself at home."}
          </h2>
          <p>
            {challenge
              ? `Enter the sign-in code for ${email}.`
              : "Sign in with a one-time email code. No password to remember."}
          </p>
          {error && <ErrorNotice message={error} retry={initialize} />}
          <form onSubmit={challenge ? verifyCode : requestCode}>
            {challenge ? (
              <>
                <label htmlFor="code">One-time code</label>
                <Input
                  className="h-12 rounded-lg bg-card px-3 text-sm"
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  minLength={6}
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoFocus
                  disabled={busy}
                />
                {demoCode && (
                  <div className="demo-code">
                    <strong>Demo mode · no email was sent</strong>
                    <span>
                      Use this demo code: <b>{demoCode}</b>
                    </span>
                    <small>
                      Production sign-in must deliver codes privately by email.
                    </small>
                  </div>
                )}
              </>
            ) : (
              <>
                <label htmlFor="email">Email address</label>
                <Input
                  className="h-12 rounded-lg bg-card px-3 text-sm"
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                />
              </>
            )}
            <Button
              type="submit"
              className="h-auto min-h-12 rounded-lg px-5 py-3 text-xs font-semibold gap-3 whitespace-normal bg-primary text-primary-foreground hover:bg-primary/90 w-full"
              disabled={busy}
            >
              {busy ? (
                <Spinner label="One moment…" />
              ) : (
                <>
                  {challenge ? "Sign in" : "Send sign-in code"}
                  <Icon name="arrow" />
                </>
              )}
            </Button>
          </form>
          {challenge && (
            <Button
              variant="ghost"
              className="text-button h-auto p-0 text-xs signin-back"
              onClick={() => {
                setChallenge("");
                setDemoCode("");
                setError("");
              }}
              disabled={busy}
            >
              Use a different email or request a new code
            </Button>
          )}
          <p className="signin-privacy">
            We’ll use this address to sign you in. Read the{" "}
            <Link href="/privacy">privacy notice</Link> and{" "}
            <Link href="/terms">terms notice</Link> for this demo.
          </p>
        </Card>
      </section>
    );
  const favoriteTools = catalog.filter((tool) => favoriteIds.includes(tool.id));
  return (
    <section className="site-container account-page section">
      <div className="section-heading account-heading">
        <div>
          <div className="eyebrow">KEEP EXPLORING</div>
          <h1>Your collection.</h1>
          <p>{user.email}</p>
        </div>
        <Button
          variant="ghost"
          className="h-auto min-h-12 rounded-lg px-5 py-3 text-xs font-semibold gap-3 whitespace-normal border border-input bg-transparent text-foreground hover:bg-accent min-h-9 px-3 py-2 text-[11px] gap-2"
          onClick={logout}
          disabled={busy}
        >
          <Icon name="logout" size={16} />
          Sign out
        </Button>
      </div>
      <div
        className="collection-tabs"
        role="tablist"
        aria-label="Your collection"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const nextTab =
            event.key === "Home"
              ? "boxes"
              : event.key === "End"
                ? "favorites"
                : tab === "boxes"
                  ? "favorites"
                  : "boxes";
          setTab(nextTab);
          document.getElementById(`${nextTab}-tab`)?.focus();
        }}
      >
        <Button
          variant="ghost"
          id="boxes-tab"
          tabIndex={tab === "boxes" ? 0 : -1}
          role="tab"
          aria-selected={tab === "boxes"}
          aria-controls="collection-panel"
          onClick={() => setTab("boxes")}
          className={tab === "boxes" ? "active" : ""}
        >
          <Icon name="box" size={18} />
          My boxes <span>{boxes.length}</span>
        </Button>
        <Button
          variant="ghost"
          id="favorites-tab"
          tabIndex={tab === "favorites" ? 0 : -1}
          role="tab"
          aria-selected={tab === "favorites"}
          aria-controls="collection-panel"
          onClick={() => setTab("favorites")}
          className={tab === "favorites" ? "active" : ""}
        >
          <Icon name="heart" size={18} />
          Favorite tools <span>{favoriteIds.length}</span>
        </Button>
      </div>
      {error && <ErrorNotice message={error} retry={initialize} />}{" "}
      {claimNotice && <div className="info-notice">{claimNotice}</div>}
      <div
        id="collection-panel"
        role="tabpanel"
        aria-labelledby={tab === "boxes" ? "boxes-tab" : "favorites-tab"}
      >
        {tab === "boxes" ? (
          boxes.length ? (
            <div className="history-grid">
              {boxes.map((box) => (
                <Link
                  className="history-card"
                  href={`/box/${box.id}`}
                  key={box.id}
                >
                  <div className="history-card-top">
                    <span
                      className={`note-icon ${box.tier === "premium" ? "orange" : "peach"}`}
                    >
                      <Icon name="box" size={25} />
                    </span>
                    <span className="history-tier">{box.tier}</span>
                  </div>
                  <span className="eyebrow">
                    {INTEREST_LABELS[box.interest]}
                  </span>
                  <h2>{box.title}</h2>
                  <p>{box.summary}</p>
                  <div className="history-bottom">
                    <span>
                      {new Date(box.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    <Icon name="arrow" size={18} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state collection-empty">
              <Icon name="box" size={38} />
              <h2>A little room for possibility.</h2>
              <p>Your boxes will be waiting here after your first discovery.</p>
              <Button
                asChild
                variant="default"
                className="h-auto min-h-12 rounded-lg px-5 py-3 text-xs font-semibold gap-3 whitespace-normal bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Link href="/discover">
                  Open my first box <Icon name="arrow" />
                </Link>
              </Button>
            </div>
          )
        ) : favoriteTools.length ? (
          <div className="tool-grid">
            {favoriteTools.map((tool) => (
              <ToolCard
                tool={tool}
                key={tool.id}
                saved={true}
                onFavorite={favorite}
                busy={!!favoriteBusy}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state collection-empty">
            <Icon name="heart" size={38} />
            <h2>Keep the ones that catch your eye.</h2>
            <p>Save a tool from any box to find it here later.</p>
            <Button
              asChild
              variant="default"
              className="h-auto min-h-12 rounded-lg px-5 py-3 text-xs font-semibold gap-3 whitespace-normal bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Link href="/discover">
                Find something useful <Icon name="arrow" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
