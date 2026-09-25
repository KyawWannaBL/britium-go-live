import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useFixedAssets } from "@/hooks/useAccounting";

function mmk(value: unknown) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value ?? 0));
}

export function AssetRegister() {
  const assets = useFixedAssets();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Fixed Asset Register</h2>
        <p className="mt-1 text-sm text-muted-foreground">Permanent enterprise asset master used by depreciation and Balance Sheet reporting.</p>
      </div>
      {assets.error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{assets.error.message}</div> : null}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Assets</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset Code</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Acquired</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Monthly Depreciation</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading assets…</TableCell></TableRow>
              ) : !(assets.data ?? []).length ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No fixed assets registered yet.</TableCell></TableRow>
              ) : (assets.data ?? []).map((asset) => {
                const monthly = Math.max(Number(asset.acquisition_cost) - Number(asset.residual_value),0) / Number(asset.useful_life_months || 1);
                return (
                  <TableRow key={asset.id}>
                    <TableCell className="font-mono text-xs">{asset.asset_code}</TableCell>
                    <TableCell className="font-medium">{asset.asset_name}</TableCell>
                    <TableCell>{asset.category.replaceAll("_"," ")}</TableCell>
                    <TableCell>{asset.acquisition_date}</TableCell>
                    <TableCell className="text-right tabular-nums">{mmk(asset.acquisition_cost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{mmk(monthly)}</TableCell>
                    <TableCell><Badge variant="outline">{asset.status}</Badge></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
