// Retained shared contract source read at 2026-10-14 03:31 UTC. This is reconstruction evidence, not a recovered Git object.
import { z } from "zod";
export const INTERESTS = ["creator", "developer", "student", "business"] as const;
export type Interest = (typeof INTERESTS)[number];
export const INTEREST_LABELS: Record<Interest, string> = {
  creator: "Video creator",
  developer: "Developer",
  student: "Student",
  business: "Business",
};
export const briefSchema = z
  .object({
    interest: z.enum(INTERESTS),
    goal: z.string().trim().max(500).default(""),
    email: z.email().max(254).optional(),
    emailConsent: z.boolean().default(false),
  })
  .strict()
  .refine((v) => !v.email || v.emailConsent, {
    message: "Consent is required to send a box email.",
    path: ["emailConsent"],
  });
export type Brief = z.infer<typeof briefSchema>;
export interface Tool {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  interests: Interest[];
  website: string;
  pricingNote: string;
  sourceUrl: string;
  reviewedAt: string | null;
  capabilities: string[];
  caveat: string;
}
export interface Recommendation {
  toolId: string;
  why: string;
  useCase: string;
  prompt: string;
  steps: string[];
}
export interface WorkflowStep {
  title: string;
  description: string;
  toolId: string;
}
export interface Box {
  id: string;
  title: string;
  summary: string;
  interest: Interest;
  tier: "free" | "premium";
  tools: Recommendation[];
  workflow: WorkflowStep[];
  createdAt: string;
  generationMode: "demo" | "openai" | "vercel";
}
export interface PublicConfig {
  demo: boolean;
  aiMode: "demo" | "openai" | "vercel";
  paymentMode: "demo" | "paypal";
  emailMode: "demo" | "resend";
  premiumPriceCents: number;
  currency: "USD";
  paypalClientId?: string;
  paymentEnvironment?: "demo" | "sandbox" | "live";
}
export interface BoxResponse {
  box: Box;
  accessToken: string;
  emailStatus?: "skipped" | "demo" | "sent" | "failed";
}
export interface CheckoutResponse {
  orderId: string;
  paypalOrderId: string;
  approvalUrl?: string;
  demo: boolean;
  accessToken: string;
  amountCents: number;
  currency: "USD";
}
export interface User {
  id: string;
  email: string;
  role?: "admin" | "member";
  createdAt?: string;
  lastLoginAt?: string;
}
export interface ApiError {
  error: { code: string; message: string; requestId?: string };
}
