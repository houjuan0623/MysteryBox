export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      data?.error?.message || "Something went wrong. Please try again.",
    );
  return data as T;
}
export type User = {
  id: string;
  email: string;
  createdAt: string;
  lastLoginAt?: string | null;
  role?: string;
};
export type Summary = {
  period: { from: string; to: string; timezone: "UTC" };
  counts: {
    pageViews: number;
    visitors: number;
    newUsers: number;
    activeUsers: number;
    freeBoxes: number;
    premiumBoxes: number;
    demoOrders: number;
    paidOrders: number;
  };
  interests: { interest: string; count: number }[];
  funnel: { visitors: number; boxUsers: number; checkoutUsers: number };
  notes: string[];
};
export type ActivityEvent = {
  id: string;
  type: string;
  at: string;
  interest?: string;
  mode?: string;
};
export type Report = {
  summary: Summary;
  users: User[];
  events: ActivityEvent[];
};
