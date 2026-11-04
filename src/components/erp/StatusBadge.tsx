import { cn } from "@/lib/utils";

const MAP: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground border-border-strong",
  Submitted: "bg-info/10 text-info border-info/30",
  Approved: "bg-info/10 text-info border-info/30",
  Planned: "bg-info/10 text-info border-info/30",
  "In Progress": "bg-warning/15 text-warning-foreground border-warning/40",
  Posted: "bg-success/10 text-success border-success/30",
  Completed: "bg-success/10 text-success border-success/30",
  Received: "bg-success/10 text-success border-success/30",
  Paid: "bg-success/10 text-success border-success/30",
  Active: "bg-success/10 text-success border-success/30",
  Good: "bg-success/10 text-success border-success/30",
  "Partially Paid": "bg-warning/15 text-warning-foreground border-warning/40",
  "Partially Received": "bg-warning/15 text-warning-foreground border-warning/40",
  Dispatched: "bg-teal/10 text-teal border-teal/30",
  "In Transit": "bg-teal/10 text-teal border-teal/30",
  Overdue: "bg-destructive/10 text-destructive border-destructive/30",
  Cancelled: "bg-destructive/10 text-destructive border-destructive/30",
  Low: "bg-warning/15 text-warning-foreground border-warning/40",
  "Out of Stock": "bg-destructive/10 text-destructive border-destructive/30",
  Inactive: "bg-muted text-muted-foreground border-border-strong",
  Archived: "bg-muted text-muted-foreground border-border-strong",
  Due: "bg-info/10 text-info border-info/30",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[11px] font-medium leading-4",
        MAP[status] ?? "bg-muted text-muted-foreground border-border-strong",
        className,
      )}
    >
      {status}
    </span>
  );
}
