import { useRef, useState } from 'react';
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
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
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
        <input
          ref={cameraInput}
          className="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Take photo with camera"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            void upload(file);
          }}
        />
        <input
          ref={galleryInput}
          className="sr-only"
          type="file"
          accept="image/*"
          aria-label="Choose existing photo"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            void upload(file);
          }}
        />
        <Button type="button" variant="outline" disabled={loading} onClick={() => cameraInput.current?.click()}>
          <Camera className="mr-2 h-4 w-4" />
          Take photo
        </Button>
        <Button type="button" variant="outline" disabled={loading} onClick={() => galleryInput.current?.click()}>
          <Upload className="mr-2 h-4 w-4" />
          {loading ? 'Uploading...' : 'Choose photo'}
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
