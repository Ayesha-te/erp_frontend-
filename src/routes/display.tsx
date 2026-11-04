import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageBody, PageHeader, Panel } from "@/components/erp/Page";
import { API_ENDPOINTS, apiJson, apiList } from "@/lib/api";

export const Route = createFileRoute("/display")({
  head: () => ({
    meta: [
      { title: "Stock Display | BakeHub" },
      { name: "description", content: "Current stock in hand by product and location." },
    ],
  }),
  component: Display,
});

type Product = {
  id: string;
  name: string;
  product_code?: string;
  minimum_stock: number | string;
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

function Display() {
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [productRows, locationRows, balanceResponse] = await Promise.all([
        apiList<Product>(API_ENDPOINTS.finishedProducts),
        apiList<Location>(API_ENDPOINTS.locations),
        apiJson<BalancesResponse>(API_ENDPOINTS.stockBalances),
      ]);
      setProducts(productRows);
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
    return products
      .filter((product) => {
        if (!normalizedQuery) return true;
        return (
          product.name.toLowerCase().includes(normalizedQuery) ||
          product.product_code?.toLowerCase().includes(normalizedQuery)
        );
      })
      .map((product) => {
        const reorderLevel = asNumber(product.minimum_stock);
        const productBalances = balances
          .filter((balance) => balance.item_type === "FG" && balance.item_id === product.id)
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
          ...product,
          balances: productBalances,
          total: productBalances.reduce((sum, balance) => sum + balance.quantity, 0),
        };
      })
      .filter((product) => product.balances.length > 0 || normalizedQuery);
  }, [balances, locationNames, products, query]);

  return (
    <>
      <PageHeader
        title="Display"
        subtitle="Current stock in hand by product and location"
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
              placeholder="Search product..."
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
            rows.map((product) => (
              <Panel key={product.id} title={product.name}>
                <div className="space-y-3">
                  <div className="text-sm font-semibold text-foreground">
                    Total stock in hand: {formatQty(product.total)}
                  </div>
                  <div className="space-y-2">
                    <div className="hidden grid-cols-[2rem_minmax(0,1fr)_7rem_5.5rem] items-center gap-4 px-3 text-[11px] font-semibold uppercase text-muted-foreground sm:grid">
                      <span>#</span>
                      <span>Location</span>
                      <span>Current Stock</span>
                      <span>Reorder</span>
                    </div>
                    {product.balances.map((balance, index) => (
                      <div
                        key={`${product.id}-${balance.location}`}
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
