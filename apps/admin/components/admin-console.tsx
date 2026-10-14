"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  Box,
  CalendarDays,
  Check,
  ChevronRight,
  CircleHelp,
  Eye,
  Fingerprint,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Mail,
  PackageOpen,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  api,
  ApiError,
  type ActivityEvent,
  type Report,
  type Summary,
  type User,
} from "@/lib/api";
import {
  defaultWindow,
  formatTimestamp,
  utcDate,
  windowQuery,
} from "@/lib/date-window.mjs";
import { cn } from "@/lib/utils";

type DateWindow = { from: string; to: string };
type Access = "checking" | "signin" | "allowed" | "forbidden" | "error";
const number = new Intl.NumberFormat("en-US");
const formatCount = (value: number) => number.format(value);
const titleCase = (value: string) =>
  value.replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex size-9 items-center justify-center rounded-xl",
          light ? "bg-[#dcecbb] text-[#284632]" : "bg-primary text-primary-foreground",
        )}
      >
        <Box className="size-5" strokeWidth={1.8} aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-semibold tracking-tight">MysteryBox</p>
        <p
          className={cn(
            "mt-0.5 text-[10px] font-medium uppercase tracking-[.18em]",
            light ? "text-[#b2c2b8]" : "text-muted-foreground",
          )}
        >
          Administration
        </p>
      </div>
    </div>
  );
}

export function AdminConsole() {
  const [access, setAccess] = useState<Access>("checking");
  const [user, setUser] = useState<User | null>(null);
  const [period, setPeriod] = useState<DateWindow>(() => defaultWindow());
  const [draft, setDraft] = useState<DateWindow>(() => defaultWindow());
  const [report, setReport] = useState<Report | null>(null);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const requestId = useRef(0);

  const loadReport = useCallback(async (window: DateWindow) => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const query = windowQuery(window);
      // 必须由 API 的会话和角色校验授权；隐藏按钮不是访问控制。
      const [summary, users, events] = await Promise.all([
        api<Summary>(`/admin/summary?${query}`),
        api<{ users: User[] }>(`/admin/users?${query}`),
        api<{ events: ActivityEvent[] }>(`/admin/events?${query}`),
      ]);
      if (id !== requestId.current) return;
      setReport({ summary, users: users.users, events: events.events });
      setAccess("allowed");
      setPeriod(window);
      setDraft(window);
      setUpdatedAt(new Date().toISOString());
    } catch (err) {
      if (id !== requestId.current) return;
      if (err instanceof ApiError && err.status === 401) {
        setAccess("signin");
        setUser(null);
      } else if (err instanceof ApiError && err.status === 403) setAccess("forbidden");
      else {
        setAccess("error");
        setError(err instanceof Error ? err.message : "Unable to load this report.");
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  const checkSession = useCallback(async () => {
    setAccess("checking");
    setError("");
    try {
      const result = await api<{ user: User | null }>("/me");
      if (!result.user) {
        setUser(null);
        setAccess("signin");
        return;
      }
      setUser(result.user);
      await loadReport(defaultWindow());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setAccess("signin");
      } else {
        setAccess("error");
        setError(err instanceof Error ? err.message : "Unable to check your session.");
      }
    }
  }, [loadReport]);

  useEffect(() => {
    void checkSession();
    return () => {
      requestId.current += 1;
    };
  }, [checkSession]);

  async function signOut() {
    setLoading(true);
    setError("");
    try {
      await api("/auth/logout", { method: "POST", body: "{}" });
      requestId.current += 1;
      setUser(null);
      setReport(null);
      setAccess("signin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign out. Please retry.");
    } finally {
      setLoading(false);
    }
  }

  function applyWindow(event: FormEvent) {
    event.preventDefault();
    try {
      windowQuery(draft);
      void loadReport(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid date window.");
    }
  }

  if (access === "signin") return <SignIn onSignedIn={checkSession} />;
  if (access === "forbidden")
    return (
      <AccessScreen
        icon={<LockKeyhole className="size-6" />}
        title="This account is not authorized"
        description="You’re signed in, but this account does not have administrator access. Ask the site owner to grant the admin role to your existing account."
      >
        <p className="break-all text-sm text-muted-foreground">{user?.email}</p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button variant="outline" disabled={loading} onClick={signOut}>
          <LogOut /> Sign out and switch accounts
        </Button>
      </AccessScreen>
    );
  if (access === "checking")
    return (
      <AccessScreen
        icon={<LoaderCircle className="size-6 animate-spin" />}
        title="Checking your access"
        description="Opening your private dashboard…"
      >
        <span role="status" className="sr-only">
          Checking administrator session
        </span>
      </AccessScreen>
    );
  if (access === "error" && !user)
    return (
      <AccessScreen
        icon={<CircleHelp className="size-6" />}
        title="Unable to connect"
        description={error}
      >
        <Button onClick={checkSession}>
          <RefreshCw /> Try again
        </Button>
      </AccessScreen>
    );

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[230px_minmax(0,1fr)]">
      <aside className="hidden min-h-svh flex-col bg-[#213c30] px-5 py-8 text-white lg:flex">
        <Brand light />
        <p className="mb-3 mt-12 px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-[#a7b9ac]">
          Workspace
        </p>
        <nav aria-label="Dashboard sections" className="space-y-1.5">
          {[
            [LayoutDashboard, "overview", "Overview"],
            [UsersRound, "users", "Users"],
            [Activity, "activity", "Activity"],
          ].map(([Icon, value, label]) => {
            const NavIcon = Icon as typeof Activity;
            return (
              <button
                key={String(value)}
                type="button"
                onClick={() => setTab(String(value))}
                aria-current={tab === value ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                  tab === value
                    ? "bg-white/10 text-white"
                    : "text-[#b4c6ba] hover:bg-white/5 hover:text-white",
                )}
              >
                <NavIcon className="size-4" />
                <span>{String(label)}</span>
                {tab === value && (
                  <ChevronRight className="ml-auto size-3.5 text-[#dcecbb]" />
                )}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto pt-24">
          <div className="rounded-xl border border-white/15 bg-white/5 p-4">
            <ShieldCheck className="mb-3 size-5 text-[#dcecbb]" />
            <p className="text-xs font-medium">A clearer picture.</p>
            <p className="mt-2 text-xs leading-relaxed text-[#b4c6ba]">
              First-party activity only. Read-only access by design.
            </p>
          </div>
          <p className="mt-6 px-1 text-[10px] text-[#a7b9ac]">MYSTERYBOX · INTERNAL</p>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-4 sm:px-8 lg:px-10">
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="hidden items-center gap-2 text-sm lg:flex">
            <span className="text-muted-foreground">Workspace</span>
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <span>Analytics</span>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="hidden gap-1.5 bg-secondary py-1 sm:inline-flex"
            >
              <span className="size-1.5 rounded-full bg-primary" /> Read only
            </Badge>
            <span
              className="max-w-44 truncate text-xs text-muted-foreground"
              title={user?.email}
            >
              {user?.email}
            </span>
            <Button
              variant="ghost"
              size="icon"
              title="Sign out"
              aria-label="Sign out"
              onClick={signOut}
              disabled={loading}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>
        <main
          id="main"
          className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10"
        >
          <div className="mb-7 flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.2em] text-muted-foreground">
                Your product, at a glance
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                {tab === "users"
                  ? "User directory"
                  : tab === "activity"
                    ? "Recent activity"
                    : "Overview"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                A little insight into what’s being discovered.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => loadReport(period)}
              disabled={loading}
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} /> Refresh
            </Button>
          </div>
          <form
            onSubmit={applyWindow}
            className="mb-7 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"
          >
            <div className="mr-2 flex h-9 items-center gap-2 text-sm font-medium">
              <CalendarDays className="size-4 text-muted-foreground" /> Date window{" "}
              <Badge variant="secondary" className="font-normal">
                UTC
              </Badge>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="from-date" className="text-xs text-muted-foreground">
                From
              </Label>
              <Input
                id="from-date"
                aria-label="Start date, UTC"
                type="date"
                className="w-40"
                value={draft.from}
                max={utcDate(new Date())}
                onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="to-date" className="text-xs text-muted-foreground">
                Through
              </Label>
              <Input
                id="to-date"
                aria-label="End date, UTC, inclusive"
                type="date"
                className="w-40"
                value={draft.to}
                max={utcDate(new Date())}
                onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                required
              />
            </div>
            <Button type="submit" disabled={loading}>
              Apply dates
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={loading}
              onClick={() => loadReport(defaultWindow(new Date(), 30))}
            >
              Last 30 days
            </Button>
            <p className="w-full text-xs text-muted-foreground">
              Both dates include their full UTC day. Maximum 31 days; activity is retained
              for 30 days.
            </p>
          </form>
          {error && (
            <Alert variant="destructive" className="mb-6" role="alert">
              <CircleHelp />
              <AlertTitle>Report unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Analytics views" className="mb-6 bg-[#e9ede6] p-1">
              <TabsTrigger value="overview" className="px-4">
                <LayoutDashboard /> Overview
              </TabsTrigger>
              <TabsTrigger value="users" className="px-4">
                <UsersRound /> Users
              </TabsTrigger>
              <TabsTrigger value="activity" className="px-4">
                <Activity /> Activity
              </TabsTrigger>
            </TabsList>
            {loading ? (
              <div role="status" aria-label="Loading report">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-36 rounded-xl" />
                  ))}
                </div>
                <Skeleton className="mt-6 h-80 rounded-xl" />
              </div>
            ) : (
              report && (
                <>
                  <TabsContent value="overview" className="space-y-6">
                    <Overview summary={report.summary} />
                  </TabsContent>
                  <TabsContent value="users">
                    <UserDirectory users={report.users} />
                  </TabsContent>
                  <TabsContent value="activity">
                    <ActivityLog events={report.events} />
                  </TabsContent>
                </>
              )
            )}
          </Tabs>
          <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5" /> Private workspace · No third-party
              trackers
            </span>
            <span aria-live="polite">
              {updatedAt && !loading
                ? `Last refreshed ${formatTimestamp(updatedAt)} UTC`
                : "All times are UTC"}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  icon,
  accent = false,
}: {
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <Card
      className={cn("gap-0 py-5 shadow-none", accent && "border-[#ccdec4] bg-[#edf4e8]")}
    >
      <CardContent>
        <div className="mb-5 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <span
            className={cn(
              "rounded-lg bg-muted p-2 text-primary",
              accent && "bg-[#dcebcf]",
            )}
          >
            {icon}
          </span>
        </div>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {formatCount(value)}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function Overview({ summary }: { summary: Summary }) {
  const c = summary.counts;
  const maxInterest = Math.max(0, ...summary.interests.map((item) => item.count));
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Anonymous browsers"
          value={c.visitors}
          detail="Distinct first-party visitor IDs"
          icon={<Fingerprint className="size-4" />}
          accent
        />
        <Metric
          label="Page views"
          value={c.pageViews}
          detail="Recorded page-view events"
          icon={<Eye className="size-4" />}
        />
        <Metric
          label="New accounts"
          value={c.newUsers}
          detail="Registered during this window"
          icon={<UsersRound className="size-4" />}
        />
        <Metric
          label="Accounts last signed in"
          value={c.activeUsers}
          detail="Latest successful sign-in in this window"
          icon={<UserRound className="size-4" />}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">From curiosity to discovery</CardTitle>
            <CardDescription>Recorded participation at each step.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                label: "Visiting",
                value: summary.funnel.visitors,
                detail: "Visitor IDs",
                icon: Eye,
              },
              {
                label: "Opening a box",
                value: summary.funnel.boxUsers,
                detail: "Box participants",
                icon: PackageOpen,
              },
              {
                label: "Starting checkout",
                value: summary.funnel.checkoutUsers,
                detail: "Checkout participants",
                icon: Sparkles,
              },
            ].map((step, i) => (
              <div key={step.label}>
                <div className="flex items-center gap-3 rounded-lg border bg-background/50 p-4">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-white text-primary">
                    <step.icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{step.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{step.detail}</p>
                  </div>
                  <span className="ml-auto text-xl font-semibold tabular-nums">
                    {formatCount(step.value)}
                  </span>
                </div>
                {i < 2 && (
                  <ArrowDown className="mx-auto my-2 size-3 text-muted-foreground" />
                )}
              </div>
            ))}
            <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
              Activity counts, not a conversion rate. Anonymous IDs and signed-in accounts
              may represent the same person.
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-base">What’s catching their eye</CardTitle>
            <CardDescription>Interests attached to recorded activity.</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.interests.some((item) => item.count > 0) ? (
              <ol className="space-y-5">
                {summary.interests.map((item, i) => (
                  <li key={item.interest}>
                    <div className="mb-2 flex items-center justify-between gap-4 text-sm">
                      <span className="flex items-center gap-3">
                        <span className="w-4 text-xs text-muted-foreground">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {titleCase(item.interest)}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatCount(item.count)}
                      </span>
                    </div>
                    <div className="ml-7 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[#76966a]"
                        style={{
                          width: `${maxInterest ? Math.max(0, Math.min(100, (item.count / maxInterest) * 100)) : 0}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                icon={<Sparkles />}
                title="No interests recorded yet"
                description="Interests will appear when visitors explore a box in this date window."
              />
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="gap-4 shadow-none">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Boxes & orders</CardTitle>
              <CardDescription className="mt-1.5">
                Demo activity is kept separate from completed payments.
              </CardDescription>
            </div>
            <Badge variant="outline">Counts only · No revenue estimate</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            {[
              ["Free boxes", c.freeBoxes, "Generated in this window"],
              ["Premium boxes", c.premiumBoxes, "Generated in this window"],
              ["Demo / test orders", c.demoOrders, "Simulation, not actual revenue"],
              ["Paid orders", c.paidOrders, "Reported by the payment backend"],
            ].map(([label, value, detail]) => (
              <div key={String(label)} className="border-l-2 border-border pl-4">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="my-2 text-2xl font-semibold tabular-nums">
                  {formatCount(Number(value))}
                </p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  {detail}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Alert className="border-[#dce4d5] bg-[#f0f4eb] text-foreground">
        <CircleHelp className="size-4" />
        <AlertTitle>A note on these numbers</AlertTitle>
        <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
          <p>
            Anonymous browsers are not people. Clearing cookies or using another browser
            creates another visitor ID; shared browsers can group multiple people. No
            fingerprinting is used.
          </p>
          {summary.notes.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {summary.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
        </AlertDescription>
      </Alert>
    </>
  );
}

function UserDirectory({ users }: { users: User[] }) {
  return (
    <Card className="gap-4 shadow-none">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Registered accounts</CardTitle>
            <CardDescription className="mt-1.5">
              New registrations in this period. Up to 100 latest accounts.
            </CardDescription>
          </div>
          <Badge variant="secondary">{users.length} shown</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {users.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Registered · UTC</TableHead>
                <TableHead>Last sign-in · UTC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                      {user.role || "member"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatTimestamp(user.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatTimestamp(user.lastLoginAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={<UsersRound />}
            title="No matching accounts"
            description="Try a wider date window. Real registrations will appear here."
          />
        )}
      </CardContent>
    </Card>
  );
}

function ActivityLog({ events }: { events: ActivityEvent[] }) {
  return (
    <Card className="gap-4 shadow-none">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Latest events</CardTitle>
            <CardDescription className="mt-1.5">
              Up to 100 events in this window. No IP addresses or raw visitor IDs.
            </CardDescription>
          </div>
          <Badge variant="secondary">{events.length} shown</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {events.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Interest</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Time · UTC</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    <span className="flex items-center gap-2 font-medium">
                      <span className="size-1.5 rounded-full bg-[#76966a]" />
                      {titleCase(event.type)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {event.interest ? (
                      titleCase(event.interest)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {event.mode ? (
                      <Badge variant="outline">{titleCase(event.mode)}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatTimestamp(event.at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState
            icon={<Activity />}
            title="A quiet window"
            description="No activity was recorded in this period. Check another date range."
          />
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center px-4 py-8 text-center">
      <span className="mb-4 rounded-xl bg-muted p-3 text-muted-foreground">{icon}</span>
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function AccessScreen({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-10 px-5 py-12">
      <Brand />
      <Card className="w-full max-w-md gap-4 text-center shadow-none">
        <CardHeader>
          <div className="mx-auto mb-3 w-fit rounded-xl bg-secondary p-3 text-primary">
            {icon}
          </div>
          <CardTitle className="text-xl">
            <h1>{title}</h1>
          </CardTitle>
          <CardDescription className="mt-2 leading-relaxed">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">{children}</CardContent>
      </Card>
    </main>
  );
}

function SignIn({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [demoEmail, setDemoEmail] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!challengeId) {
        const result = await api<{
          challengeId: string;
          developmentCode?: string;
        }>("/auth/request-code", {
          method: "POST",
          body: JSON.stringify({ email: email.trim() }),
        });
        setChallengeId(result.challengeId);
        setDemoEmail(Boolean(result.developmentCode));
      } else {
        await api("/auth/verify-code", {
          method: "POST",
          body: JSON.stringify({ challengeId, code }),
        });
        await onSignedIn();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to sign in. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[#213c30] p-12 text-white lg:flex">
        <Brand light />
        <div className="relative z-10 max-w-md py-20">
          <Badge className="mb-7 border border-white/15 bg-white/5 text-[#dcecbb]">
            THE VIEW BEHIND THE BOX
          </Badge>
          <h1 className="text-5xl font-medium leading-[1.12] tracking-tight">
            Small discoveries.
            <br />
            <span className="text-[#dcecbb]">Meaningful insights.</span>
          </h1>
          <p className="mt-6 max-w-sm text-base leading-relaxed text-[#b4c6ba]">
            A private home for your product’s activity, people, and possibilities.
          </p>
          <div className="mt-12 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs text-[#d0ded4]">
            <ShieldCheck className="size-4 text-[#dcecbb]" /> Secure access · First-party
            insights
          </div>
        </div>
        <p className="text-xs text-[#9daf9f]">MysteryBox administration</p>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-48 -right-48 size-[560px] rounded-full border-[70px] border-[#dcecbb]/[.035]"
        />
      </section>
      <section className="flex flex-col items-center justify-center px-6 py-12">
        <div className="mb-12 lg:hidden">
          <Brand />
        </div>
        <div className="w-full max-w-sm">
          <span className="mb-6 inline-flex rounded-xl border bg-white p-3 text-primary">
            <LockKeyhole className="size-5" />
          </span>
          <h2 className="text-3xl font-semibold tracking-tight">
            {challengeId ? "Check your inbox" : "Welcome back"}
          </h2>
          <p className="mb-8 mt-3 text-sm leading-relaxed text-muted-foreground">
            {challengeId
              ? `Enter the one-time code sent to ${email.trim()}.`
              : "Sign in with your administrator email. We’ll send you a one-time code."}
          </p>
          <form onSubmit={submit} className="space-y-5">
            {!challengeId ? (
              <div className="space-y-2">
                <Label htmlFor="admin-email">Email address</Label>
                <Input
                  id="admin-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="h-11 bg-white"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={254}
                  required
                  autoFocus
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="admin-code">One-time code</Label>
                <Input
                  id="admin-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  minLength={6}
                  maxLength={6}
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="h-12 bg-white text-center text-xl tracking-[.4em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  autoFocus
                />
              </div>
            )}
            {demoEmail && (
              <Alert>
                <AlertTitle>Local demo email mode</AlertTitle>
                <AlertDescription className="text-xs">
                  No email is delivered in demo mode. Use the local API’s development
                  code, or configure a real email provider. Admin permissions are still
                  required.
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="h-11 w-full" disabled={busy}>
              {busy ? (
                <LoaderCircle className="animate-spin" />
              ) : challengeId ? (
                <Check />
              ) : (
                <Mail />
              )}
              {busy
                ? "Please wait…"
                : challengeId
                  ? "Verify and sign in"
                  : "Send sign-in code"}
              {!busy && <ArrowRight className="ml-auto" />}
            </Button>
            {challengeId && (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={busy}
                onClick={() => {
                  setChallengeId("");
                  setCode("");
                  setError("");
                  setDemoEmail(false);
                }}
              >
                Use another email or request a new code
              </Button>
            )}
          </form>
          <p className="mt-8 flex items-start gap-2 border-t pt-5 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> Access is restricted to
            authorized administrators. Your sign-in session is stored in an HttpOnly
            cookie.
          </p>
        </div>
        <p className="mt-12 text-xs text-muted-foreground">
          Private by default. Read only by design.
        </p>
      </section>
    </main>
  );
}
