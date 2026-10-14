import Link from "next/link";
export default function Terms() {
  return (
    <article className="site-container legal-page">
      <div className="eyebrow">KNOW WHAT’S INSIDE</div>
      <h1>Terms notice</h1>
      <p className="legal-intro">
        This is a product demo, not finalized production terms of service. Production
        policy decisions must be completed before launch.
      </p>
      <h2>What a MysteryBox contains</h2>
      <p>
        A box contains curated recommendations for third-party AI tools, prompts, and
        suggested use steps. A free box contains one tool recommendation. A premium box
        contains three recommendations and a connected workflow. The service is not a
        lottery, gambling product, investment, resale opportunity, or a promise of
        monetary value.
      </p>
      <h2>Pricing and third-party costs</h2>
      <p>
        The premium price shown by the app is a one-time curation price in US dollars. It
        does not include subscriptions, usage credits, or services sold by recommended
        tool providers. In demo payment mode, checkout is simulated and no money is
        charged. When live PayPal mode is enabled, the displayed checkout price is payable
        through PayPal.
      </p>
      <h2>Recommendations need your judgment</h2>
      <p>
        Tool capabilities, pricing, availability, and terms can change. AI-generated
        recommendations may contain mistakes. Check the official tool websites and
        evaluate outputs before relying on them. No ratings, financial returns,
        productivity results, or third-party endorsements are promised.
      </p>
      <h2>Production decisions still pending</h2>
      <p>
        The operator must finalize its legal identity and contact details, eligibility
        rules, refunds and cancellations, consumer rights, taxes, service commitments,
        acceptable-use requirements, liability provisions, governing law, and dispute
        handling. This demo does not invent or settle those policies.
      </p>
      <h2>External services</h2>
      <p>
        Following a tool link takes you to an independent provider. Any signup, purchase,
        or use of that service is subject to that provider’s own terms. A MysteryBox
        purchase does not grant a license to the recommended software.
      </p>
      <p>
        <Link href="/discover" className="text-link">
          Return to discovery →
        </Link>
      </p>
    </article>
  );
}
