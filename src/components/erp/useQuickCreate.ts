import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useErp } from "@/lib/erp/store";

export function useQuickCreate() {
  const { user } = useErp();
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const [open, setOpenState] = useState(false);
  useEffect(() => {
    if (user?.role !== "View only" && new URLSearchParams(search).get("new") === "1") {
      setOpenState(true);
    } else if (user?.role === "View only") {
      setOpenState(false);
    }
  }, [search, user?.role]);
  const setOpen = (value: boolean) => {
    if (value && user?.role === "View only") return;
    setOpenState(value);
    if (!value && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("new")) {
        url.searchParams.delete("new");
        window.history.replaceState(window.history.state, "", url);
      }
    }
  };
  return [open, setOpen] as const;
}
