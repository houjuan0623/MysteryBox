import { Button } from "@/components/ui/button";
import Link from "next/link";
import { BoxArt } from "@/components/box-art";
import { Icon, type IconName } from "@/components/icon";
import { HomePricing } from "@/components/home-pricing";
const interests: {
  id: string;
  icon: IconName;
  title: string;
  detail: string;
  color: string;
}[] = [
  {
    id: "creator",
    icon: "video",
    title: "Create something",
    detail: "From a first idea to your next video.",
    color: "peach",
  },
  {
    id: "developer",
    icon: "code",
    title: "Build something",
    detail: "A better way from concept to code.",
    color: "lavender",
  },
  {
    id: "student",
    icon: "book",
    title: "Learn something",
    detail: "Make room for your next lightbulb moment.",
    color: "green",
  },
  {
    id: "business",
    icon: "briefcase",
    title: "Grow something",
    detail: "Get a little more out of your workday.",
    color: "yellow",
  },
];
export default function Home() {
  return (
    <>
      <section className="site-container hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="small-star">✦</span> A GOOD KIND OF SURPRISE
          </div>
          <h1>
            Good tools.
            <br />
            Unexpected
            <br />
            <em>possibilities.</em>
          </h1>
          <p className="hero-description">
            The internet has enough tools. Find the ones that move you forward. Open a
            curated box of AI tools, ideas, and practical ways to use them.
          </p>
          <div className="hero-actions">
            <Button
              asChild
              variant="default"
              className="h-auto min-h-12 rounded-lg px-5 py-3 text-xs font-semibold gap-3 whitespace-normal bg-primary text-primary-foreground hover:bg-primary/90 min-h-14 px-6 py-4 text-sm"
            >
              <Link href="/discover">
                Find my first box <Icon name="arrow" />
              </Link>
            </Button>
            <span className="handwritten">A little curious? It’s free.</span>
          </div>
          <div className="hero-fine">
            <span>
              <Icon name="check" size={15} />
              No card needed for your free box
            </span>
            <span>
              <Icon name="check" size={15} />
              Built around your interests
            </span>
          </div>
        </div>
        <BoxArt />
      </section>
      <section className="value-strip">
        <div className="site-container value-inner">
          <span>LESS SCROLLING. MORE POSSIBILITY.</span>
          <div>
            <Icon name="sparkles" />
            Thoughtfully matched
          </div>
          <div>
            <Icon name="box" />
            Ready-to-use ideas
          </div>
          <div>
            <Icon name="arrow" />A clear next step
          </div>
        </div>
      </section>
      <section className="site-container section interests-section">
        <div className="section-heading">
          <div>
            <div className="eyebrow">FOLLOW YOUR CURIOSITY</div>
            <h2>What are you into?</h2>
          </div>
          <p>
            Choose a direction.
            <br />
            We’ll help with the discovery.
          </p>
        </div>
        <div className="interest-grid">
          {interests.map((item) => (
            <Link
              href={`/discover?interest=${item.id}`}
              className={`interest-card ${item.color}`}
              key={item.id}
            >
              <span className="interest-icon">
                <Icon name={item.icon} size={26} />
              </span>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
              <span className="card-arrow">
                <Icon name="arrow" />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="how-section">
        <div className="site-container section">
          <div className="section-heading">
            <div>
              <div className="eyebrow">FROM “WHAT IF” TO “LET’S TRY”</div>
              <h2>A small box. A useful beginning.</h2>
            </div>
            <Link href="/discover" className="text-link">
              See what’s inside <Icon name="arrow" size={18} />
            </Link>
          </div>
          <div className="steps-grid">
            <article>
              <span className="step-number">01</span>
              <h3>Tell us what you’re exploring.</h3>
              <p>
                Pick your interest and share a goal. A tiny starting point is all you
                need.
              </p>
            </article>
            <article>
              <span className="step-number">02</span>
              <h3>Open a box made for that.</h3>
              <p>
                Discover relevant AI tools with a clear explanation of why each one fits.
              </p>
            </article>
            <article>
              <span className="step-number">03</span>
              <h3>Put your discovery to work.</h3>
              <p>
                Try a ready-to-copy prompt and a practical next step. Premium connects
                three tools into a workflow.
              </p>
            </article>
          </div>
        </div>
      </section>
      <HomePricing />
      <section className="site-container closing-note">
        <Icon name="sparkles" size={26} />
        <h2>
          Your next good idea
          <br />
          might start with a little curiosity.
        </h2>
        <Button
          asChild
          variant="secondary"
          className="h-auto min-h-12 rounded-lg px-5 py-3 text-xs font-semibold gap-3 whitespace-normal bg-secondary text-secondary-foreground hover:bg-secondary/90"
        >
          <Link href="/discover">
            Let’s explore <Icon name="arrow" />
          </Link>
        </Button>
        <p>Discovery, not a lottery. Every box contains useful recommendations.</p>
      </section>
    </>
  );
}
