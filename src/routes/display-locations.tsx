import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageBody, PageHeader, Panel } from "@/components/erp/Page";
import { API_ENDPOINTS, apiJson, apiList } from "@/lib/api";

export const Route = createFileRoute("/display-locations")({
  head: () => ({
    meta: [
      { title: "Location Display | Zekra Sweets ERP" },
      { name: "description", content: "Current stock in hand grouped by location." },
    ],
  }),
  component: LocationDisplay,
});

type Location = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  minimum_stock: number | string;
};

type RawMaterial = {
  id: string;
  name: string;
  reorder_level: number | string;
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

function LocationDisplay() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [locationRows, productRows, materialRows, balanceResponse] = await Promise.all([
        apiList<Location>(API_ENDPOINTS.locations),
        apiList<Product>(API_ENDPOINTS.finishedProducts),
        apiList<RawMaterial>(API_ENDPOINTS.rawMaterials),
        apiJson<BalancesResponse>(API_ENDPOINTS.stockBalances),
      ]);
      setLocations(locationRows);
      setProducts(productRows);
      setMaterials(materialRows);
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

  const itemMeta = useMemo(() => {
    const meta = new Map<string, { name: string; reorderLevel: number }>();
    products.forEach((product) =>
      meta.set(`FG:${product.id}`, {
        name: product.name,
        reorderLevel: asNumber(product.minimum_stock),
      }),
    );
    materials.forEach((material) =>
      meta.set(`RM:${material.id}`, {
        name: material.name,
        reorderLevel: asNumber(material.reorder_level),
      }),
    );
    return meta;
  }, [materials, products]);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return locations
      .filter((location) => !normalizedQuery || location.name.toLowerCase().includes(normalizedQuery))
      .map((location) => {
        const stock = balances
          .filter((balance) => balance.location_id === location.id && asNumber(balance.quantity) !== 0)
          .map((balance) => {
            const meta = itemMeta.get(`${balance.item_type}:${balance.item_id}`);
            const quantity = asNumber(balance.quantity);
            const reorderLevel = meta?.reorderLevel ?? 0;
            return {
              itemType: balance.item_type,
              name: meta?.name ?? `${balance.item_type} ${balance.item_id}`,
              quantity,
              reorderLevel,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        return { ...location, stock };
      })
      .filter((location) => location.stock.length > 0 || normalizedQuery);
  }, [balances, itemMeta, locations, query]);

  return (
    <>
      <PageHeader
        title="Location Display"
        subtitle="Current stock in hand grouped by location"
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
              placeholder="Search location..."
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
            rows.map((location) => (
              <Panel key={location.id} title={location.name}>
                <div className="space-y-2">
                  <div className="hidden grid-cols-[2rem_3.25rem_minmax(0,1fr)_7rem_5.5rem] items-center gap-4 px-3 text-[11px] font-semibold uppercase text-muted-foreground sm:grid">
                    <span>#</span>
                    <span>Type</span>
                    <span>Item</span>
                    <span>Current Stock</span>
                    <span>Reorder</span>
                  </div>
                  {location.stock.map((item, index) => (
                    <div
                      key={`${location.id}-${item.itemType}-${item.name}`}
                    className="grid gap-2 rounded border bg-background px-3 py-2 text-sm sm:grid-cols-[2rem_3.25rem_minmax(0,1fr)_7rem_5.5rem] sm:items-center sm:gap-4"
                    >
                      <span className="text-muted-foreground">{index + 1}.</span>
                      <span className="rounded bg-muted px-2 py-0.5 text-center text-[11px] font-semibold text-muted-foreground">
                        {item.itemType}
                      </span>
                      <span className="min-w-0 truncate font-medium text-foreground">{item.name}</span>
                      <span className="text-right tabular-nums text-foreground">
                        {formatQty(item.quantity)}
                      </span>
                      <span className="text-right tabular-nums text-muted-foreground">
                        {formatQty(item.reorderLevel)}
                      </span>
                    </div>
                  ))}
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
