import { useState } from 'react';
import { QrCode, Save } from 'lucide-react';
import { recordQrWorkflowStep } from '@/lib/qrWorkflow';
import { Button } from '@/components/ui/button';

export function QrStepActionCard({
  title,
  processStep,
  shipmentId,
  deliveryId,
  manifestId,
  staffRows,
  onDone,
}: {
  title: string;
  processStep: string;
  shipmentId?: string | null;
  deliveryId?: string | null;
  manifestId?: string | null;
  staffRows: Array<{ id: string; full_name?: string | null; staff_code?: string | null }>;
  onDone?: () => Promise<void> | void;
}) {
  const [actorStaffId, setActorStaffId] = useState('');
  const [nextStaffId, setNextStaffId] = useState('');
  const [territoryCode, setTerritoryCode] = useState('');
  const [notes, setNotes] = useState('');
  const [scanChannel, setScanChannel] = useState<'qr_scanner' | 'mobile_scanner' | 'manual_override'>('qr_scanner');
  const [loading, setLoading] = useState(false);

  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <div className="text-base font-semibold">{title}</div>

      <select className="h-10 w-full rounded-md border px-3 text-sm" value={actorStaffId} onChange={(e) => setActorStaffId(e.target.value)}>
        <option value="">Actor Staff</option>
        {staffRows.map((row) => (
          <option key={row.id} value={row.id}>
            {row.full_name || row.staff_code || row.id}
          </option>
        ))}
      </select>

      <select className="h-10 w-full rounded-md border px-3 text-sm" value={nextStaffId} onChange={(e) => setNextStaffId(e.target.value)}>
        <option value="">Next Responsible Staff</option>
        {staffRows.map((row) => (
          <option key={row.id} value={row.id}>
            {row.full_name || row.staff_code || row.id}
          </option>
        ))}
      </select>

      <input
        className="h-10 w-full rounded-md border px-3 text-sm"
        placeholder="Territory Code"
        value={territoryCode}
        onChange={(e) => setTerritoryCode(e.target.value)}
      />

      <select className="h-10 w-full rounded-md border px-3 text-sm" value={scanChannel} onChange={(e) => setScanChannel(e.target.value as any)}>
        <option value="qr_scanner">QR Scanner</option>
        <option value="mobile_scanner">Mobile Scanner</option>
        <option value="manual_override">Manual Override</option>
      </select>

      <textarea
        className="min-h-[96px] w-full rounded-md border p-3 text-sm"
        placeholder="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <Button
        type="button"
        disabled={loading || !actorStaffId}
        onClick={async () => {
          setLoading(true);
          try {
            await recordQrWorkflowStep({
              actorStaffId,
              nextStaffId: nextStaffId || null,
              shipmentId: shipmentId || null,
              deliveryId: deliveryId || null,
              manifestId: manifestId || null,
              processStep,
              territoryCode: territoryCode || null,
              scanChannel,
              notes: notes || null,
            });
            setNotes('');
            if (onDone) await onDone();
          } finally {
            setLoading(false);
          }
        }}
      >
        <QrCode className="mr-2 h-4 w-4" />
        {loading ? 'Recording...' : 'Record QR Step'}
      </Button>
    </div>
  );
}
