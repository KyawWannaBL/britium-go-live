import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { uploadDataUrlToBucket } from '@/lib/storageUpload';

export function SignaturePadField({
  onUploaded,
  label,
}: {
  onUploaded: (path: string, dataUrl: string) => void;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(320, Math.floor(rect.width));
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <canvas
        ref={canvasRef}
        className="w-full rounded-md border bg-white"
        onPointerDown={(e) => {
          const ctx = canvasRef.current?.getContext('2d');
          if (!ctx) return;
          const p = point(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          setDrawing(true);
        }}
        onPointerMove={(e) => {
          if (!drawing) return;
          const ctx = canvasRef.current?.getContext('2d');
          if (!ctx) return;
          const p = point(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }}
        onPointerUp={() => setDrawing(false)}
        onPointerLeave={() => setDrawing(false)}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }}
        >
          Clear
        </Button>
        <Button
          type="button"
          onClick={async () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            setLoading(true);
            try {
              const dataUrl = canvas.toDataURL('image/png');
              const path = await uploadDataUrlToBucket('ops-signatures', dataUrl, 'signatures', 'signature.png');
              onUploaded(path, dataUrl);
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? 'Uploading...' : 'Save Signature'}
        </Button>
      </div>
    </div>
  );
}
