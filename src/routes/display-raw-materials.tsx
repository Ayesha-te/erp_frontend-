import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageBody, PageHeader, Panel } from "@/components/erp/Page";
import { API_ENDPOINTS, apiJson, apiList } from "@/lib/api";

export const Route = createFileRoute("/display-raw-materials")({
  head: () => ({
    meta: [
      { title: "Raw Material Display | Zekra Sweets ERP" },
      { name: "description", content: "Current raw material stock in hand by location." },
    ],
  }),
  component: RawMaterialDisplay,
});

type RawMaterial = {
  id: string;
  name: string;
  material_code?: string;
  reorder_level: number | string;
};

type Location = {
  id: string;
  name: string;
};

type Balance = {
  item_type: "RM" | "FG";
  item_id: string;
  location_id: string;
  quantity: number | string;
};

type BalancesResponse = {
  success: boolean;
  data: Balance[];
};

function asNumber(value: number | string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQty(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 3,
  }).format(value);
}

function RawMaterialDisplay() {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [materialRows, locationRows, balanceResponse] = await Promise.all([
        apiList<RawMaterial>(API_ENDPOINTS.rawMaterials),
        apiList<Location>(API_ENDPOINTS.locations),
        apiJson<BalancesResponse>(API_ENDPOINTS.stockBalances),
      ]);
      setMaterials(materialRows);
      setLocations(locationRows);
      setBalances(balanceResponse.data ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load stock balances");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const locationNames = useMemo(
    () => new Map(locations.map((location) => [location.id, location.name])),
    [locations],
  );

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return materials
      .filter((material) => {
        if (!normalizedQuery) return true;
        return (
          material.name.toLowerCase().includes(normalizedQuery) ||
          material.material_code?.toLowerCase().includes(normalizedQuery)
        );
      })
      .map((material) => {
        const reorderLevel = asNumber(material.reorder_level);
        const materialBalances = balances
          .filter((balance) => balance.item_type === "RM" && balance.item_id === material.id)
          .map((balance) => {
            const quantity = asNumber(balance.quantity);
            return {
              location: locationNames.get(balance.location_id) ?? balance.location_id,
              quantity,
              reorderLevel,
            };
          })
          .sort((a, b) => a.location.localeCompare(b.location));
        return {
          ...material,
          balances: materialBalances,
          total: materialBalances.reduce((sum, balance) => sum + balance.quantity, 0),
        };
      })
      .filter((material) => material.balances.length > 0 || normalizedQuery);
  }, [balances, locationNames, materials, query]);

  return (
    <>
      <PageHeader
        title="Raw Material Display"
        subtitle="Current raw material stock in hand by location"
        actions={
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Refresh
          </Button>
        }
      />
      <PageBody>
        <Panel>
          <div className="relative max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search raw material..."
            />
          </div>
        </Panel>

        {error && (
          <Panel>
            <p className="text-sm font-medium text-destructive">{error}</p>
          </Panel>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {loading ? (
            <Panel>
              <p className="text-sm text-muted-foreground">Loading stock...</p>
            </Panel>
          ) : rows.length ? (
            rows.map((material) => (
              <Panel key={material.id} title={material.name}>
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-foreground">
                    Total stock in hand: {formatQty(material.total)}
                  </div>
                  <div className="space-y-2">
                    <div className="hidden grid-cols-[2rem_minmax(0,1fr)_7rem_5.5rem] items-center gap-4 px-3 text-[11px] font-semibold uppercase text-muted-foreground sm:grid">
                      <span>#</span>
                      <span>Location</span>
                      <span>Current Stock</span>
                      <span>Reorder</span>
                    </div>
                    {material.balances.map((balance, index) => (
                      <div
                        key={`${material.id}-${balance.location}`}
                        className="grid gap-2 rounded border bg-background px-3 py-2 text-sm sm:grid-cols-[2rem_minmax(0,1fr)_7rem_5.5rem] sm:items-center sm:gap-4"
                      >
                        <span className="text-muted-foreground">{index + 1}.</span>
                        <span className="min-w-0 truncate font-medium text-foreground">
                          {balance.location}
                        </span>
                        <span className="text-right tabular-nums text-foreground">
                          {formatQty(balance.quantity)}
                        </span>
                        <span className="text-right tabular-nums text-muted-foreground">
                          {formatQty(balance.reorderLevel)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
            ))
          ) : (
            <Panel>
              <p className="text-sm text-muted-foreground">No stock found.</p>
            </Panel>
          )}
        </div>
      </PageBody>
    </>
  );
}
