import Link from "next/link";
import { AnalyticsPreferences } from "@/components/analytics-preferences";
export default function Privacy() {
  return (
    <article className="site-container legal-page">
      <div className="eyebrow">A CLEARER PICTURE</div>
      <h1>Privacy notice</h1>
      <p className="legal-intro">
        This is a demo implementation. Production privacy policies and operational choices
        are still pending.
      </p>
      <h2>Information used by this app</h2>
      <p>
        Your selected interest and goal are used to create recommendations. Please don’t
        put confidential, health, financial, or other sensitive information into your
        goal. Signing in uses your email address and a one-time code. Box history and
        favorites are associated with your signed-in account.
      </p>
      <h2>Browser storage and sessions</h2>
      <p>
        This app uses an authentication cookie for sign-in. It also stores box access
        tokens, checkout access tokens, and retry identifiers in your browser’s session
        storage. Treat a box’s access token as private. Browser storage can be cleared or
        lost, so sign in if you want to associate discoveries with an account.
      </p>
      <h2>Demo and connected services</h2>
      <p>
        The demo uses a local recommendation engine, simulated checkout, and simulated
        email when those modes are enabled. The app displays these modes. A configured
        production deployment can send interest and goal information to Vercel AI Gateway
        and the configured model provider, checkout details to PayPal, and email addresses
        and messages to the email provider. Official third-party tool websites have their
        own policies.
      </p>
      <h2>Optional first-party analytics</h2>
      <p>
        Usage events include only a random session identifier, a unique event identifier,
        and one of four coarse page paths: home, discover, box, or account. They exclude
        URL query strings, goal text, email addresses, and payment fields. The same
        optional session identifier can accompany box and checkout requests to measure the
        flow. Your browser’s Do Not Track setting is respected. The backend removes usage
        events older than 30 days in an hourly cleanup. Optional events do not store your
        account identifier. Opting out stops these usage events.
      </p>
      <AnalyticsPreferences />
      <h2>Essential account and transaction records</h2>
      <p>
        Sign-in timestamps, account creation, saved boxes and order/payment states remain
        necessary to operate your account and fulfil requests. Administrators can view
        aggregate counts derived from those records even when optional usage analytics is
        off. These counts are separate from optional browsing events and do not constitute
        financial reconciliation or net revenue.
      </p>
      <h2>Before a production launch</h2>
      <p>
        The operator must publish the legal entity and contact information, confirm
        applicable legal bases and data rights, define retention and deletion practices,
        review service providers and international data transfers, and finalize security
        and incident procedures. These decisions have not been represented as completed by
        this demo.
      </p>
      <h2>Your choice to receive a box</h2>
      <p>
        Emailing a box requires you to enter an address and choose the consent checkbox
        for that single email. Sign-in codes are requested separately through the account
        screen.
      </p>
      <p>
        <Link href="/discover" className="text-link">
          Return to discovery →
        </Link>
      </p>
    </article>
  );
}
