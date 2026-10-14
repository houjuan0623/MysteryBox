import type { Metadata } from "next";
import { Header, Footer, ModeBanner } from "@/components/shell";
import { MotionFrame } from "@/components/motion-frame";
import { ActivityTracker } from "@/components/activity-tracker";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "MysteryBox — Find your next useful thing",
    template: "%s · MysteryBox",
  },
  description:
    "Discover a thoughtfully curated box of AI tools, practical prompts, and a clear next step for your goals.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <ModeBanner />
        <Header />
        <ActivityTracker />
        <main id="main">
          <MotionFrame>{children}</MotionFrame>
        </main>
        <Footer />
      </body>
    </html>
  );
}
