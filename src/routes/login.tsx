import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, LockKeyhole, Wheat } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getBakeryCode, setBakery } from "@/lib/api";
import { useErp } from "@/lib/erp/store";
import { firstAllowedPath } from "@/lib/erp/permissions";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { user, login, canView } = useErp();
  const navigate = useNavigate();
  const [bakery, setBakeryInput] = useState(getBakeryCode());
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) void navigate({ to: firstAllowedPath(canView), replace: true });
  }, [canView, navigate, user]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!bakery.trim() || !username.trim() || !password)
      return setError("Enter your bakery code, username and password.");
    setBakery(bakery);
    setBusy(true);
    try {
      const result = await login(username, password);
      if (!result.ok) setError(result.message ?? "Sign in failed. Please try again.");
      // On success, stay on /login until the authenticated provider state is
      // committed. The user effect above then performs one race-free redirect.
    } catch {
      setError("Sign in could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground">
            <Wheat className="h-6 w-6" aria-hidden="true" />
          </span>
          <span className="text-xl font-bold tracking-tight text-sidebar-accent-foreground">BakeHub</span>
        </div>
        <div>
          <h2 className="max-w-md text-4xl font-bold leading-tight text-sidebar-accent-foreground">
            From flour to finished invoice, all in one warm workspace.
          </h2>
          <p className="mt-4 max-w-md text-sm text-sidebar-foreground/80">
            Purchases, recipes, production runs, stock and sales for your bakery. Private to your team.
          </p>
        </div>
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-sidebar-primary/20" />
      </aside>
      <section className="grid place-items-center px-6 py-10">
        <form className="w-full max-w-[400px] space-y-5" onSubmit={submit} noValidate>
          <div className="lg:hidden flex items-center gap-2 font-bold text-primary"><Wheat className="h-5 w-5" /> BakeHub</div>
          <div>
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Sign in with your bakery code.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bakery">Bakery code</Label>
            <Input id="bakery" name="bakery" value={bakery} onChange={(e) => setBakeryInput(e.target.value)} placeholder="e.g. sweetcrumbs" autoCapitalize="none" required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Username or email</Label>
            <Input id="username" name="username" type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input id="password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-11" required />
              <button type="button" className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground" onClick={() => setVisible((v) => !v)} aria-label={visible ? "Hide password" : "Show password"}>
                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div aria-live="assertive" aria-atomic="true">
            {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
          </div>
          <Button className="w-full" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        </form>
      </section>
    </main>
  );
}
