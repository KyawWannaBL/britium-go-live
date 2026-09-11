import { useState } from 'react';
import { Camera, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadFileToBucket } from '@/lib/storageUpload';

export function PhotoUploaderField({
  bucket = 'ops-photos',
  label,
  onUploaded,
}: {
  bucket?: string;
  label: string;
  onUploaded: (path: string, file: File) => void;
}) {
  const [loading, setLoading] = useState(false);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <Camera className="h-4 w-4" />
          Capture / Upload
          <input
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setLoading(true);
              try {
                const path = await uploadFileToBucket(bucket, file, 'photos');
                onUploaded(path, file);
              } finally {
                setLoading(false);
                e.currentTarget.value = '';
              }
            }}
          />
        </label>
        <Button type="button" variant="outline" disabled={loading}>
          <Upload className="mr-2 h-4 w-4" />
          {loading ? 'Uploading...' : 'Ready'}
        </Button>
      </div>
    </div>
  );
}
