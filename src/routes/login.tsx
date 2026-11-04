import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, LockKeyhole, Wheat } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useErp } from "@/lib/erp/store";
import { firstAllowedPath } from "@/lib/erp/permissions";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { user, login, canView } = useErp();
  const navigate = useNavigate();
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
    if (!username.trim() || !password) return setError("Enter your username and password.");
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
    <main className="grid min-h-screen place-items-center bg-[#eef2f7] px-4 py-8">
      <section className="w-full max-w-[430px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_18px_55px_rgba(15,39,71,0.14)]">
        <div className="flex items-center gap-3 bg-[#082f61] px-7 py-6 text-white">
          <span className="grid h-11 w-11 place-items-center rounded-md bg-[#1677ff]">
            <Wheat className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Zekra Sweets ERP</h1>
            <p className="mt-0.5 text-xs text-blue-100">Production · Inventory · Sales</p>
          </div>
        </div>
        <form className="space-y-5 px-7 py-7" onSubmit={submit} noValidate>
          <div>
            <div className="flex items-center gap-2">
              <LockKeyhole className="h-4 w-4 text-primary" />
              <h2 className="text-xl font-semibold text-slate-950">Sign in to your workspace</h2>
            </div>
            <p className="mt-2 text-sm text-slate-600">Use your username and password.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pr-11"
                required
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => setVisible((value) => !value)}
                aria-label={visible ? "Hide password" : "Show password"}
              >
                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div aria-live="assertive" aria-atomic="true">
            {error && (
              <p
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </p>
            )}
          </div>
          <Button className="w-full" type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </section>
    </main>
  );
}
