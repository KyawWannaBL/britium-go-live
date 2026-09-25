import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export type PreviewLine = {
  account: string;
  description: string;
  debit: number;
  credit: number;
};

function mmk(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export function AccountingPreview({ lines }: { lines: PreviewLine[] }) {
  const debit = lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0);
  const difference = debit - credit;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Accounting Preview</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Debit (MMK)</TableHead>
              <TableHead className="text-right">Credit (MMK)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Enter a manual expense to preview the journal.
                </TableCell>
              </TableRow>
            ) : lines.map((line, index) => (
              <TableRow key={`${line.account}-${index}`}>
                <TableCell className="font-medium">{line.account}</TableCell>
                <TableCell>{line.description}</TableCell>
                <TableCell className="text-right tabular-nums">{line.debit ? mmk(line.debit) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{line.credit ? mmk(line.credit) : "—"}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-semibold">
              <TableCell colSpan={2}>Totals</TableCell>
              <TableCell className="text-right tabular-nums">{mmk(debit)}</TableCell>
              <TableCell className="text-right tabular-nums">{mmk(credit)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <div className={`mt-3 text-sm font-semibold ${difference === 0 ? "text-emerald-700" : "text-red-700"}`}>
          Difference: MMK {mmk(Math.abs(difference))}
        </div>
      </CardContent>
    </Card>
  );
}
