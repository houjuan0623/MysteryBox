import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MysteryBox · Admin",
  description: "Private, read-only MysteryBox product analytics.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
