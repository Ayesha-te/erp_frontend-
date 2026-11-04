import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  ChevronDown,
  CircleHelp,
  MapPin,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Wheat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { NAV, QUICK_CREATE, isGroup, type NavEntry } from "./nav";
import { useErp } from "@/lib/erp/store";
import { stockRows } from "@/lib/erp/ledger";
import { toast } from "sonner";

function useAlerts() {
  const { db, ledger } = useErp();
  return useMemo(() => {
    const rows = stockRows(ledger);
    const lowRm = db.rawMaterials.filter((rm) => {
      const q = rows.filter((r) => r.itemId === rm.id).reduce((s, r) => s + r.qty, 0);
      return q <= rm.reorderLevel;
    });
    const lowFg = db.products.filter((p) => {
      const q = rows.filter((r) => r.itemId === p.id).reduce((s, r) => s + r.qty, 0);
      return q <= p.minStock;
    });
    return { lowRm, lowFg };
  }, [db, ledger]);
}

function SidebarNav({ onNavigate, collapsed }: { onNavigate?: () => void; collapsed?: boolean }) {
  const { canView: can } = useErp();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState<string[]>(() => NAV.filter(isGroup).map((g) => g.label));
  const toggle = (l: string) =>
    setOpen((o) => (o.includes(l) ? o.filter((x) => x !== l) : [...o, l]));

  const linkCls = (to: string, sub?: boolean) =>
    cn(
      "flex items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[13px] transition-colors",
      sub ? "pl-8" : "",
      path === to
        ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    );

  const render = (e: NavEntry) => {
    if (!isGroup(e)) {
      const Icon = e.icon;
      return (
        <Link key={e.to} to={e.to} onClick={onNavigate} className={linkCls(e.to)} title={e.label}>
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="truncate">{e.label}</span>}
        </Link>
      );
    }
    const Icon = e.icon;
    const expanded = open.includes(e.label);
    const active = e.items.some((i) => path.startsWith(i.to));
    if (collapsed) {
      return (
        <DropdownMenu key={e.label}>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex w-full items-center justify-center rounded-sm px-2.5 py-1.5 text-sidebar-foreground hover:bg-sidebar-accent",
                active && "bg-sidebar-accent",
              )}
              aria-label={e.label}
            >
              <Icon className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start">
            <DropdownMenuLabel>{e.label}</DropdownMenuLabel>
            {e.items.map((i) => (
              <DropdownMenuItem key={i.to} asChild>
                <Link to={i.to}>{i.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
    return (
      <div key={e.label}>
        <button
          onClick={() => toggle(e.label)}
          aria-expanded={expanded}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent",
            active && "text-sidebar-accent-foreground",
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">{e.label}</span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
          />
        </button>
        {expanded && (
          <div className="mt-0.5 space-y-0.5">
            {e.items.map((i) => (
              <Link key={i.to} to={i.to} onClick={onNavigate} className={linkCls(i.to, true)}>
                <span className="truncate">{i.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  const visible: NavEntry[] = NAV.flatMap<NavEntry>((entry) => {
    if (!isGroup(entry)) return entry.module && can(entry.module) ? [entry] : [];
    const items = entry.items.filter((item) => item.module && can(item.module));
    return items.length ? [{ ...entry, items } as NavEntry] : [];
  });
  return <nav className="space-y-0.5 px-2 py-2">{visible.map(render)}</nav>;
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-sidebar-primary text-sidebar-primary-foreground">
        <Wheat className="h-4 w-4" />
      </span>
      {!collapsed && (
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-semibold text-sidebar-accent-foreground">
            Zekra Sweets ERP
          </span>
          <span className="block truncate text-[10px] text-sidebar-foreground/70">
            Production • Inventory • Sales
          </span>
        </span>
      )}
    </Link>
  );
}

function Breadcrumbs() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const parts = path.split("/").filter(Boolean);
  const pretty = (s: string) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <nav
      aria-label="Breadcrumb"
      className="hidden min-w-0 items-center gap-1 text-[12px] text-muted-foreground lg:flex"
    >
      <Link to="/" className="hover:text-foreground">
        Home
      </Link>
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="text-border-strong">/</span>
          <span className={cn("truncate", i === parts.length - 1 && "text-foreground")}>
            {pretty(p)}
          </span>
        </span>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout, db, branch, setBranch, canView: can, canManage } = useErp();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const navigate = useNavigate();
  const alerts = useAlerts();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (!user) return null;

  const flat = NAV.flatMap((e) => (isGroup(e) ? e.items : [e])).filter(
    (item) => item.module && can(item.module),
  );
  const quickCreate = QUICK_CREATE.filter((item) => canManage(item.module));
  const alertCount = alerts.lowRm.length + alerts.lowFg.length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen bg-background">
        <aside
          className={cn(
            "hidden shrink-0 flex-col bg-sidebar md:flex",
            collapsed ? "w-[60px]" : "w-[228px]",
          )}
        >
          <Brand collapsed={collapsed} />
          <div className="flex-1 overflow-y-auto">
            <SidebarNav collapsed={collapsed} />
          </div>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-2 border-t border-sidebar-border px-4 py-2 text-[12px] text-sidebar-foreground hover:bg-sidebar-accent"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
            {!collapsed && "Collapse"}
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-surface px-3 sm:px-4">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 md:hidden"
                  aria-label="Open navigation"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[250px] bg-sidebar p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <Brand />
                <div className="overflow-y-auto pb-10">
                  <SidebarNav onNavigate={() => setMobileOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>

            <Breadcrumbs />

            <button
              onClick={() => setCmdOpen(true)}
              className="ml-auto flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border bg-surface-muted px-2.5 text-[13px] text-muted-foreground hover:bg-accent sm:max-w-sm"
            >
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">Search for anything…</span>
              <kbd className="ml-auto hidden rounded border bg-surface px-1 text-[10px] sm:block">
                ⌘K
              </kbd>
            </button>

            <div className="flex shrink-0 items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden h-8 gap-1.5 text-[13px] lg:flex"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    {branch === "ALL"
                      ? "All Locations"
                      : db.locations.find((l) => l.id === branch)?.name}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Active location</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={branch} onValueChange={setBranch}>
                    <DropdownMenuRadioItem value="ALL">All Locations</DropdownMenuRadioItem>
                    {db.locations
                      .filter((l) => l.type !== "virtual")
                      .map((l) => (
                        <DropdownMenuRadioItem key={l.id} value={l.id}>
                          {l.name}
                        </DropdownMenuRadioItem>
                      ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative h-8 w-8"
                    aria-label="Notifications"
                  >
                    <Bell className="h-4 w-4" />
                    {alertCount > 0 && (
                      <span className="absolute right-0.5 top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-destructive px-0.5 text-[9px] font-semibold text-destructive-foreground">
                        {alertCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0">
                  <div className="border-b px-3 py-2 text-[13px] font-semibold">Alerts</div>
                  <div className="max-h-80 space-y-1 overflow-y-auto p-2 text-[13px]">
                    {alertCount === 0 && (
                      <p className="p-2 text-muted-foreground">No alerts right now.</p>
                    )}
                    {can("raw_materials") &&
                      alerts.lowRm.map((r) => (
                        <Link
                          key={r.id}
                          to="/inventory/raw-materials"
                          className="block rounded px-2 py-1.5 hover:bg-accent"
                        >
                          <span className="font-medium">Low stock:</span> {r.name} below reorder
                          level
                        </Link>
                      ))}
                    {can("finished_goods") &&
                      alerts.lowFg.map((r) => (
                        <Link
                          key={r.id}
                          to="/inventory/finished-goods"
                          className="block rounded px-2 py-1.5 hover:bg-accent"
                        >
                          <span className="font-medium">Low stock:</span> {r.name} below minimum
                        </Link>
                      ))}
                  </div>
                </PopoverContent>
              </Popover>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="Help"
                    onClick={() =>
                      toast.info("Zekra Sweets ERP", {
                        description:
                          "Use Quick Create to start documents. Post a document to move stock — every movement is written to the Stock Ledger.",
                      })
                    }
                  >
                    <CircleHelp className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Help & tips</TooltipContent>
              </Tooltip>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 gap-2 px-1.5">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                      {user.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </span>
                    <span className="hidden text-left leading-tight sm:block">
                      <span className="block text-[12px] font-medium">{user.name}</span>
                      <span className="block text-[10px] text-muted-foreground">{user.role}</span>
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel>
                    <span className="block">{user.name}</span>
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      @{user.username} · {user.role}
                    </span>
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      {user.role === "Administrator"
                        ? "All modules"
                        : `${user.modules?.length ?? 0} modules assigned`}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {can("settings") && (
                    <DropdownMenuItem asChild>
                      <Link to="/settings">Settings</Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onSelect={() => {
                      logout();
                      void navigate({ to: "/login", replace: true });
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" /> Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {quickCreate.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-8 gap-1.5 text-[13px]">
                      <Plus className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Quick Create</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Create new</DropdownMenuLabel>
                    {quickCreate.map((q) => (
                      <DropdownMenuItem
                        key={q.label}
                        onSelect={() => navigate({ to: q.to, search: { new: 1 } })}
                      >
                        {q.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </header>

          <main className="min-w-0 flex-1">{children}</main>
        </div>

        <CommandDialog open={cmdOpen} onOpenChange={setCmdOpen}>
          <CommandInput placeholder="Search modules, documents, master data…" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Modules">
              {flat.map((i) => (
                <CommandItem
                  key={i.to}
                  value={i.label}
                  onSelect={() => {
                    setCmdOpen(false);
                    navigate({ to: i.to });
                  }}
                >
                  {i.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {can("customers") && (
              <CommandGroup heading="Customers">
                {db.customers.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.name + " " + c.code}
                    onSelect={() => {
                      setCmdOpen(false);
                      navigate({ to: "/sales/customers", search: { q: c.code } });
                    }}
                  >
                    {c.name}{" "}
                    <span className="ml-2 text-[11px] text-muted-foreground">{c.code}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {can("suppliers") && (
              <CommandGroup heading="Suppliers">
                {db.suppliers.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={c.name + " " + c.code}
                    onSelect={() => {
                      setCmdOpen(false);
                      navigate({ to: "/purchasing/suppliers", search: { q: c.code } });
                    }}
                  >
                    {c.name}{" "}
                    <span className="ml-2 text-[11px] text-muted-foreground">{c.code}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </CommandDialog>
      </div>
    </TooltipProvider>
  );
}
