import { useState } from 'react';
import { Camera, Upload } from 'lucide-react';
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
  const [error, setError] = useState<string | null>(null);

  const upload = async (file?: File) => {
    if (!file || loading) return;
    setError(null);
    setLoading(true);
    try {
      if (!file.type.startsWith('image/')) {
        throw new Error('Please capture or select an image.');
      }
      const path = await uploadFileToBucket(bucket, file, 'photos');
      onUploaded(path, file);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Photo upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex flex-wrap items-center gap-3">
        {([
          { camera: true, caption: 'Take photo' },
          { camera: false, caption: loading ? 'Uploading...' : 'Choose photo' },
        ] as const).map(({ camera, caption }) => (
          <label key={String(camera)} className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${loading ? 'opacity-50' : 'cursor-pointer'}`}>
            {camera ? <Camera className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
            {caption}
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              {...(camera ? { capture: 'environment' as const } : {})}
              disabled={loading}
              aria-label={camera ? 'Take photo with camera' : 'Choose existing photo'}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                void upload(file);
              }}
            />
          </label>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
