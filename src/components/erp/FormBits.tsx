import { useState, type ReactNode } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useErp } from "@/lib/erp/store";

export function Field({
  label,
  required,
  error,
  hint,
  children,
  className,
  htmlFor,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={htmlFor} className="text-[12px] font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-[12px] text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function FormGrid({ children, cols = 3 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2",
        cols === 3 && "lg:grid-cols-3",
        cols === 4 && "lg:grid-cols-4",
      )}
    >
      {children}
    </div>
  );
}

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  disabled,
  className,
  ariaLabel,
}: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const { db } = useErp();
  const unavailable = new Set<string>();
  const masterCollections = [
    db.locations,
    db.suppliers,
    db.customers,
    db.categories,
    db.uoms,
    db.taxRates,
    db.paymentMethods,
    db.rawMaterials,
    db.products,
    db.recipes,
  ] as unknown as Array<Array<Record<string, unknown>>>;
  for (const records of masterCollections) {
    for (const record of records) {
      const archived =
        record.active === false || String(record.status ?? "").toLowerCase() === "inactive";
      if (!archived) continue;
      for (const identifier of [record.id, record.code, record.name]) {
        if (identifier) unavailable.add(String(identifier));
      }
    }
  }
  const availableOptions = options.filter((option) => !unavailable.has(option.value));
  const sel = availableOptions.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label={ariaLabel ?? placeholder}
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-8 w-full justify-between bg-surface px-2.5 text-[13px] font-normal",
            !sel && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{sel ? sel.label : placeholder}</span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" className="h-9 text-[13px]" />
          <CommandList>
            <CommandEmpty>No match found.</CommandEmpty>
            <CommandGroup>
              {availableOptions.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label + " " + (o.hint ?? "")}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className="text-[13px]"
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5",
                      value === o.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{o.label}</span>
                  {o.hint && (
                    <span className="ml-auto text-[11px] text-muted-foreground">{o.hint}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function TotalsBox({
  rows,
  grand,
}: {
  rows: { label: string; value: string }[];
  grand: { label: string; value: string };
}) {
  return (
    <div className="w-full rounded-md border bg-surface-muted p-3 sm:max-w-xs">
      <dl className="space-y-1.5 text-[13px]">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="num font-medium">{r.value}</dd>
          </div>
        ))}
        <div className="mt-2 flex justify-between gap-4 border-t pt-2">
          <dt className="font-semibold">{grand.label}</dt>
          <dd className="num text-[15px] font-semibold text-primary">{grand.value}</dd>
        </div>
      </dl>
    </div>
  );
}
