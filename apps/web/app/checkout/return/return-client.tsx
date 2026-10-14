"use client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  BoxResponse,
  CheckoutResponse,
  PublicConfig,
} from "@mysterybox/shared";
import {
  api,
  clearRequestKey,
  errorMessage,
  getConfig,
  orderRecord,
  price,
  saveBox,
} from "@/lib/api";
import { Icon } from "@/components/icon";
import { ErrorNotice, Spinner } from "@/components/shell";
import { OpeningAnimation } from "@/components/motion-frame";
export function CheckoutReturn() {
  const search = useSearchParams();
  const router = useRouter();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [order, setOrder] = useState<CheckoutResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const inFlight = useRef(false);
  async function complete(record: CheckoutResponse) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<BoxResponse>(
        `/checkout/orders/${encodeURIComponent(record.orderId)}/${record.demo ? "demo-complete" : "capture"}`,
        {
          method: "POST",
          headers: { "x-order-token": record.accessToken },
          body: "{}",
        },
      );
      saveBox(result);
      clearRequestKey("checkout");
      router.replace(`/box/${result.box.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
      inFlight.current = false;
    }
  }
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const id = search.get("order");
    const record = id ? orderRecord(id) : null;
    if (!record) {
      setError(
        "We couldn’t find this checkout in your current browser session. Return to the browser where you started, or check your account for completed boxes.",
      );
      return;
    }
    setOrder(record);
    void getConfig()
      .then(setConfig)
      .catch(() => {});
    if (!record.demo) {
      if (search.get("token") !== record.paypalOrderId) {
        setError(
          "The payment return does not match this order. Please return from the original PayPal checkout.",
        );
        return;
      }
      void complete(record);
    }
  }, [search]);
  const canRetry =
    order && (order.demo || search.get("token") === order.paypalOrderId);
  return (
    <section className="site-container checkout-page">
      <Card
        className={`checkout-card block gap-0 rounded-2xl p-7 shadow-sm sm:p-10 ${busy ? "is-curating" : ""}`}
        aria-busy={busy}
      >
        <span className="checkout-art">
          <Icon name="box" size={48} />
        </span>
        <div className="eyebrow">
          {order?.demo
            ? "DEMO CHECKOUT"
            : config?.paymentEnvironment === "sandbox"
              ? "PAYPAL SANDBOX CHECKOUT"
              : "YOUR PREMIUM DISCOVERY"}
        </div>
        <h1>
          {order?.demo ? "A little more possibility." : "Let’s open your box."}
        </h1>
        {order?.demo ? (
          <>
            <p>
              Explore a premium box with three tool recommendations,
              ready-to-use prompts, and a connected workflow.
            </p>
            <div className="checkout-summary">
              <span>Premium discovery · one box</span>
              <strong>{price(order.amountCents)}</strong>
            </div>
            <div className="demo-checkout-notice">
              <strong>This is a simulated payment.</strong>
              <span>
                No payment details are collected and no money will be charged.
                The displayed price is for the demo experience.
              </span>
            </div>
          </>
        ) : (
          <p>
            {config?.paymentEnvironment === "sandbox"
              ? "We’ll confirm your simulated PayPal sandbox payment. No real money is charged."
              : "We’ll confirm your payment with PayPal, then bring your recommendations together."}
          </p>
        )}
        {error && <ErrorNotice message={error} />}
        {busy && <OpeningAnimation />}
        <div aria-live="polite">
          {busy ? (
            <Spinner
              label={
                order?.demo
                  ? "Curating your premium box…"
                  : "Confirming your order…"
              }
            />
          ) : canRetry ? (
            <Button
              variant="ghost"
              onClick={() => complete(order!)}
              className="h-auto min-h-12 rounded-lg px-5 py-3 text-xs font-semibold gap-3 whitespace-normal bg-primary text-primary-foreground hover:bg-primary/90 w-full"
            >
              {error
                ? "Retry this order"
                : order?.demo
                  ? "Open demo premium box"
                  : "Confirm and open my box"}
              <Icon name="arrow" />
            </Button>
          ) : null}
        </div>
        <p className="checkout-note">
          Third-party tool subscriptions are not included.{" "}
          {order?.demo || config?.paymentEnvironment === "sandbox"
            ? "Nothing is purchased in this test environment."
            : "This is a one-time curation purchase."}
        </p>
        <div className="checkout-links">
          <Link href="/discover">Back to discovery</Link>
          <Link href="/account">My collection</Link>
        </div>
      </Card>
    </section>
  );
}
