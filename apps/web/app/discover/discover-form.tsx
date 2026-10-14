"use client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  INTERESTS,
  INTEREST_LABELS,
  type Interest,
  type PublicConfig,
  type BoxResponse,
  type CheckoutResponse,
} from "@mysterybox/shared";
import {
  api,
  clearRequestKey,
  errorMessage,
  getConfig,
  price,
  requestKey,
  saveBox,
  saveOrder,
} from "@/lib/api";
import { Icon, type IconName } from "@/components/icon";
import { ErrorNotice, Spinner } from "@/components/shell";
import { OpeningAnimation } from "@/components/motion-frame";
const icons: Record<Interest, IconName> = {
  creator: "video",
  developer: "code",
  student: "book",
  business: "briefcase",
};
const examples: Record<Interest, string[]> = {
  creator: ["Plan a week of short videos", "Turn an idea into a video script"],
  developer: ["Build my first side project", "Make code reviews more useful"],
  student: ["Understand a difficult topic", "Build a better study routine"],
  business: ["Create a clear project plan", "Write a better customer email"],
};
export function DiscoverForm() {
  const router = useRouter();
  const search = useSearchParams();
  const requested = search.get("interest");
  const [interest, setInterest] = useState<Interest>(
    INTERESTS.includes(requested as Interest)
      ? (requested as Interest)
      : "creator",
  );
  const [goal, setGoal] = useState("");
  const [tier, setTier] = useState<"free" | "premium">(
    search.get("tier") === "premium" ? "premium" : "free",
  );
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [configError, setConfigError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const loadConfig = () => {
    setConfigError("");
    getConfig()
      .then(setConfig)
      .catch((err) => setConfigError(errorMessage(err)));
  };
  useEffect(loadConfig, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !config) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const brief = { interest, goal: goal.trim(), emailConsent: false };
    try {
      if (tier === "free") {
        const result = await api<BoxResponse>("/boxes/free", {
          method: "POST",
          headers: { "Idempotency-Key": requestKey("free", brief) },
          body: JSON.stringify(brief),
        });
        saveBox(result);
        clearRequestKey("free");
        router.push(`/box/${result.box.id}`);
      } else {
        const order = await api<CheckoutResponse>("/checkout/orders", {
          method: "POST",
          headers: { "Idempotency-Key": requestKey("checkout", brief) },
          body: JSON.stringify(brief),
        });
        saveOrder(order);
        if (order.demo) {
          router.push(
            `/checkout/return?order=${encodeURIComponent(order.orderId)}`,
          );
        } else if (order.approvalUrl) {
          window.location.assign(order.approvalUrl);
        } else
          throw new Error(
            "The payment provider didn’t return a checkout link. Please try again.",
          );
      }
    } catch (err) {
      setError(errorMessage(err));
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="discover-intro">
      <div className="site-container">
        <div className="center-heading">
          <div className="eyebrow">
            <Icon name="sparkles" size={16} /> YOUR NEXT USEFUL DISCOVERY
          </div>
          <h1>
            Let curiosity <em>take the lead.</em>
          </h1>
          <p>A little about you. A box full of possibilities.</p>
        </div>
        {search.get("cancelled") === "1" && (
          <div className="info-notice" role="status">
            Checkout was canceled. No new box was opened. You can try again
            whenever you’re ready.
          </div>
        )}
        <form
          className={`discovery-form ${busy ? "is-curating" : ""}`}
          onSubmit={submit}
          aria-busy={busy}
        >
          <div className="discovery-main">
            <fieldset>
              <legend>
                <span className="form-step">01</span>What’s your direction?
              </legend>
              <div className="interest-options">
                {INTERESTS.map((id) => (
                  <label
                    className={`interest-option ${interest === id ? "selected" : ""}`}
                    key={id}
                  >
                    <input
                      type="radio"
                      name="interest"
                      value={id}
                      checked={interest === id}
                      onChange={() => setInterest(id)}
                      disabled={busy}
                    />
                    <Icon name={icons[id]} size={24} />
                    <span>{INTEREST_LABELS[id]}</span>
                    <span className="radio-circle">
                      {interest === id && <span />}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="goal-field">
              <label htmlFor="goal">
                <span className="form-step">02</span>What would you like to do?
                <span className="optional">Optional</span>
              </label>
              <Textarea
                className="min-h-28 rounded-lg bg-card px-4 py-3 text-sm leading-relaxed"
                id="goal"
                value={goal}
                maxLength={500}
                onChange={(e) => setGoal(e.target.value)}
                rows={3}
                placeholder="I’d love a little help with…"
                disabled={busy}
                aria-describedby="goal-help"
              />
              <div className="input-helper">
                <span id="goal-help">
                  A specific goal helps us find a better fit. Don’t include
                  sensitive information.
                </span>
                <span>{goal.length}/500</span>
              </div>
              <div className="goal-examples">
                <span>Try an idea:</span>
                {examples[interest].map((example) => (
                  <Button
                    variant="outline"
                    className="h-auto rounded-full bg-muted px-2 py-1 text-[10px] font-normal"
                    key={example}
                    type="button"
                    onClick={() => setGoal(example)}
                    disabled={busy}
                  >
                    {example}
                    <Icon name="plus" size={12} />
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <aside className="discovery-choice">
            <div className="eyebrow">PICK YOUR LEVEL OF DISCOVERY</div>
            <fieldset>
              <legend className="sr-only">Choose a box</legend>
              <label
                className={`tier-option ${tier === "free" ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="tier"
                  checked={tier === "free"}
                  onChange={() => setTier("free")}
                  disabled={busy}
                />
                <div className="tier-top">
                  <strong>Free box</strong>
                  <span>$0</span>
                </div>
                <p>1 matched tool, a prompt, and a place to start.</p>
              </label>
              <label
                className={`tier-option ${tier === "premium" ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="tier"
                  checked={tier === "premium"}
                  onChange={() => setTier("premium")}
                  disabled={busy}
                />
                <div className="tier-top">
                  <strong>
                    <Icon name="sparkles" size={16} /> Premium box
                  </strong>
                  <span>{config ? price(config.premiumPriceCents) : "—"}</span>
                </div>
                <p>
                  3 complementary tools, useful prompts, and a connected
                  workflow.
                </p>
                <span className="one-time">
                  One-time purchase · no recurring charge
                </span>
              </label>
            </fieldset>
            {configError && (
              <ErrorNotice message={configError} retry={loadConfig} />
            )}
            <Button
              type="submit"
              className="h-auto min-h-12 rounded-lg px-5 py-3 text-xs font-semibold gap-3 whitespace-normal bg-primary text-primary-foreground hover:bg-primary/90 w-full"
              disabled={busy || !config}
            >
              {busy ? (
                <Spinner
                  label={
                    tier === "free"
                      ? "Curating your box…"
                      : "Preparing checkout…"
                  }
                />
              ) : (
                <>
                  {tier === "free"
                    ? "Open my free box"
                    : config?.paymentMode === "demo"
                      ? "Try premium demo"
                      : "Continue to checkout"}
                  <Icon name="arrow" />
                </>
              )}
            </Button>
            {busy && <OpeningAnimation />}
            {tier === "free" ? (
              <p className="checkout-note">
                No card. No commitment. Just a useful discovery.
              </p>
            ) : (
              <p className="checkout-note">
                {config?.paymentMode === "demo"
                  ? "Demo checkout. No actual charge."
                  : config?.paymentEnvironment === "sandbox"
                    ? "PayPal sandbox checkout. No real money is charged."
                    : "Secure checkout with PayPal."}{" "}
                The box price covers curation; third-party subscriptions cost
                extra.
              </p>
            )}
            {config?.aiMode === "demo" && (
              <div className="demo-mini">
                <span className="status-dot" />
                Demo recommendation engine
              </div>
            )}
            {error && <ErrorNotice message={error} />}
          </aside>
        </form>
        <div className="discovery-footnote">
          <Icon name="shield" size={17} />
          <span>
            Every box is a set of recommendations. There are no prizes, random
            payouts, or resale values.
          </span>
        </div>
      </div>
    </section>
  );
}
