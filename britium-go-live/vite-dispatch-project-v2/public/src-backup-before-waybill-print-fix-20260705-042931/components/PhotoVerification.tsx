// Photo Verification Component for Order Picking
import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Camera, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  Upload,
  Eye,
  Trash2,
  Download
} from 'lucide-react';

interface PhotoVerificationProps {
  onPhotoVerified: (photo: VerifiedPhoto) => void;
  onPhotoRejected: (reason: string) => void;
  requireLabel?: boolean;
  requireClearCondition?: boolean;
  maxPhotos?: number;
}

interface VerifiedPhoto {
  id: string;
  dataUrl: string;
  timestamp: string;
  verificationStatus: 'VERIFIED' | 'REJECTED';
  verificationDetails: {
    isBlurred: boolean;
    hasLabel: boolean;
    isClearCondition: boolean;
    confidence: number;
  };
  metadata: {
    width: number;
    height: number;
    size: number;
  };
}

export function PhotoVerification({
  onPhotoVerified,
  onPhotoRejected,
  requireLabel = true,
  requireClearCondition = true,
  maxPhotos = 5
}: PhotoVerificationProps) {
  const [photos, setPhotos] = useState<VerifiedPhoto[]>([]);
  const [currentPhoto, setCurrentPhoto] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: 1920, height: 1080 }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Cannot access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setCurrentPhoto(dataUrl);
        stopCamera();
        verifyPhoto(dataUrl);
      }
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setCurrentPhoto(dataUrl);
        verifyPhoto(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const verifyPhoto = async (dataUrl: string) => {
    setIsVerifying(true);
    setVerificationResult(null);

    try {
      // Simulate photo verification with AI/ML
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Create image element for analysis
      const img = new Image();
      img.src = dataUrl;

      await new Promise((resolve) => {
        img.onload = resolve;
      });

      // Simulate verification checks
      const isBlurred = await checkBlurriness(img);
      const hasLabel = requireLabel ? await detectLabel(img) : true;
      const isClearCondition = requireClearCondition ? await checkCondition(img) : true;
      const confidence = Math.random() * 0.3 + 0.7; // 70-100%

      const verificationDetails = {
        isBlurred,
        hasLabel,
        isClearCondition,
        confidence
      };

      const isVerified = !isBlurred && hasLabel && isClearCondition && confidence > 0.6;

      const verifiedPhoto: VerifiedPhoto = {
        id: Date.now().toString(),
        dataUrl,
        timestamp: new Date().toISOString(),
        verificationStatus: isVerified ? 'VERIFIED' : 'REJECTED',
        verificationDetails,
        metadata: {
          width: img.width,
          height: img.height,
          size: dataUrl.length
        }
      };

      setVerificationResult(verificationDetails);

      if (isVerified) {
        if (photos.length < maxPhotos) {
          setPhotos([...photos, verifiedPhoto]);
          onPhotoVerified(verifiedPhoto);
          setCurrentPhoto(null);
        } else {
          alert(`Maximum ${maxPhotos} photos allowed`);
        }
      } else {
        const reasons = [];
        if (isBlurred) reasons.push('Photo is blurred');
        if (!hasLabel) reasons.push('Label not detected');
        if (!isClearCondition) reasons.push('Product condition not clear');
        if (confidence <= 0.6) reasons.push('Low confidence score');
        
        onPhotoRejected(reasons.join(', '));
      }
    } catch (error) {
      console.error('Error verifying photo:', error);
      onPhotoRejected('Verification error');
    } finally {
      setIsVerifying(false);
    }
  };

  const checkBlurriness = async (img: HTMLImageElement): Promise<boolean> => {
    // Simulate blurriness detection
    // In production, use Laplacian variance or similar algorithm
    const blurScore = Math.random();
    return blurScore < 0.2; // 20% chance of being blurred
  };

  const detectLabel = async (img: HTMLImageElement): Promise<boolean> => {
    // Simulate label detection using OCR or object detection
    // In production, use TensorFlow.js, Tesseract.js, or cloud vision API
    const hasLabel = Math.random() > 0.15; // 85% chance of having label
    return hasLabel;
  };

  const checkCondition = async (img: HTMLImageElement): Promise<boolean> => {
    // Simulate product condition check
    // In production, use image quality assessment algorithms
    const isClear = Math.random() > 0.1; // 90% chance of clear condition
    return isClear;
  };

  const retakePhoto = () => {
    setCurrentPhoto(null);
    setVerificationResult(null);
    startCamera();
  };

  const deletePhoto = (photoId: string) => {
    setPhotos(photos.filter(p => p.id !== photoId));
  };

  const downloadPhoto = (photo: VerifiedPhoto) => {
    const link = document.createElement('a');
    link.href = photo.dataUrl;
    link.download = `photo_${photo.id}.jpg`;
    link.click();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Camera className="w-5 h-5" />
              Photo Verification ({photos.length}/{maxPhotos})
            </span>
            {photos.length < maxPhotos && (
              <div className="flex gap-2">
                {!cameraActive && !currentPhoto && (
                  <>
                    <Button onClick={startCamera} size="sm">
                      <Camera className="w-4 h-4 mr-2" />
                      Camera
                    </Button>
                    <Button 
                      onClick={() => fileInputRef.current?.click()} 
                      size="sm" 
                      variant="outline"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      Upload
                    </Button>
                  </>
                )}
              </div>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Camera View */}
          {cameraActive && (
            <div className="space-y-4">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 border-4 border-dashed border-white/30 m-4 rounded-lg pointer-events-none" />
              </div>
              <div className="flex gap-2">
                <Button onClick={capturePhoto} className="flex-1" size="lg">
                  <Camera className="w-4 h-4 mr-2" />
                  Capture Photo
                </Button>
                <Button onClick={stopCamera} variant="outline" size="lg">
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Current Photo Verification */}
          {currentPhoto && (
            <div className="space-y-4">
              <div className="relative">
                <img 
                  src={currentPhoto} 
                  alt="Captured" 
                  className="w-full rounded-lg"
                />
                {isVerifying && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                    <div className="text-center text-white">
                      <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                      <p>Verifying photo...</p>
                    </div>
                  </div>
                )}
              </div>

              {verificationResult && !isVerifying && (
                <Alert variant={
                  verificationResult.isBlurred || 
                  !verificationResult.hasLabel || 
                  !verificationResult.isClearCondition 
                    ? 'destructive' 
                    : 'default'
                }>
                  <AlertDescription>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        {verificationResult.isBlurred ? (
                          <XCircle className="w-4 h-4 text-red-500" />
                        ) : (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        )}
                        <span>Blur Check: {verificationResult.isBlurred ? 'Failed' : 'Passed'}</span>
                      </div>
                      {requireLabel && (
                        <div className="flex items-center gap-2">
                          {!verificationResult.hasLabel ? (
                            <XCircle className="w-4 h-4 text-red-500" />
                          ) : (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          )}
                          <span>Label Detection: {verificationResult.hasLabel ? 'Passed' : 'Failed'}</span>
                        </div>
                      )}
                      {requireClearCondition && (
                        <div className="flex items-center gap-2">
                          {!verificationResult.isClearCondition ? (
                            <XCircle className="w-4 h-4 text-red-500" />
                          ) : (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          )}
                          <span>Condition Check: {verificationResult.isClearCondition ? 'Passed' : 'Failed'}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span>Confidence: {(verificationResult.confidence * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {verificationResult && (
                verificationResult.isBlurred || 
                !verificationResult.hasLabel || 
                !verificationResult.isClearCondition
              ) && (
                <Alert variant="destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription>
                    <strong>Photo Rejected!</strong> Please retake the photo ensuring:
                    <ul className="list-disc list-inside mt-2">
                      {verificationResult.isBlurred && <li>Photo is not blurred (hold steady)</li>}
                      {!verificationResult.hasLabel && <li>Product label is clearly visible</li>}
                      {!verificationResult.isClearCondition && <li>Product condition is clear</li>}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <Button onClick={retakePhoto} variant="outline" className="w-full">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retake Photo
              </Button>
            </div>
          )}

          {/* Verified Photos Grid */}
          {photos.length > 0 && (
            <div>
              <h3 className="font-medium mb-3">Verified Photos</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {photos.map((photo) => (
                  <div key={photo.id} className="relative group">
                    <img 
                      src={photo.dataUrl} 
                      alt="Verified" 
                      className="w-full aspect-square object-cover rounded-lg"
                    />
                    <Badge 
                      className="absolute top-2 left-2"
                      variant={photo.verificationStatus === 'VERIFIED' ? 'default' : 'destructive'}
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Verified
                    </Badge>
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                      <Button 
                        size="sm" 
                        variant="secondary"
                        onClick={() => downloadPhoto(photo)}
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => deletePhoto(photo.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {new Date(photo.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />

          {/* Hidden canvas for photo capture */}
          <canvas ref={canvasRef} className="hidden" />
        </CardContent>
      </Card>
    </div>
  );
}