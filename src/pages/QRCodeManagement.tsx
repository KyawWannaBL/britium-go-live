// QR Code Management Page
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  QrCode, 
  Package, 
  Truck, 
  User, 
  Warehouse, 
  Scan,
  History,
  CheckCircle,
  Clock,
  AlertTriangle,
  Download,
  Printer,
  Eye,
  Search,
  Filter,
  RefreshCw,
  X,
  Camera
} from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { IMAGES } from '@/assets/images';

interface QRCodeData {
  id: string;
  qr_code: string;
  qr_type: 'SHIPMENT' | 'PARCEL' | 'VEHICLE' | 'RIDER' | 'WAREHOUSE';
  reference_id: string;
  reference_type: string;
  status: 'ACTIVE' | 'SCANNED' | 'EXPIRED';
  data: any;
  created_at: string;
  expires_at?: string;
  scan_count: number;
  last_scanned_at?: string;
  last_scanned_by?: string;
  last_scan_location?: any;
}

interface ScanHistory {
  id: string;
  qr_code_id: string;
  scanned_by: string;
  scanned_at: string;
  scan_location?: any;
  device_info?: any;
  scan_result: 'SUCCESS' | 'FAILED' | 'EXPIRED';
  notes?: string;
}

export default function QRCodeManagement() {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<'GENERATE' | 'SCAN' | 'MANAGE' | 'HISTORY'>('GENERATE');
  const [qrCodes, setQrCodes] = useState<QRCodeData[]>([]);
  const [scanHistory, setScanHistory] = useState<ScanHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [selectedQR, setSelectedQR] = useState<QRCodeData | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Generation form state
  const [generateForm, setGenerateForm] = useState({
    type: 'SHIPMENT',
    reference_id: '',
    reference_type: '',
    expires_in_hours: 24,
    data: {}
  });

  useEffect(() => {
    loadQRCodes();
    loadScanHistory();
  }, []);

  const loadQRCodes = async () => {
    try {
      setLoading(true);
      // Mock data for demonstration
      const mockQRCodes: QRCodeData[] = [
        {
          id: '1',
          qr_code: 'QR001',
          qr_type: 'SHIPMENT',
          reference_id: 'SHP-2026-001',
          reference_type: 'shipment',
          status: 'ACTIVE',
          data: { weight: '5kg', destination: 'Yangon' },
          created_at: new Date().toISOString(),
          scan_count: 0
        }
      ];
      setQrCodes(mockQRCodes);
    } catch (error) {
      console.error('Error loading QR codes:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadScanHistory = async () => {
    try {
      const mockHistory: ScanHistory[] = [];
      setScanHistory(mockHistory);
    } catch (error) {
      console.error('Error loading scan history:', error);
    }
  };

  const generateQRCode = async () => {
    try {
      setLoading(true);
      
      const newQR: QRCodeData = {
        id: Date.now().toString(),
        qr_code: `QR${Date.now()}`,
        qr_type: generateForm.type as any,
        reference_id: generateForm.reference_id,
        reference_type: generateForm.reference_type,
        status: 'ACTIVE',
        data: generateForm.data,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + generateForm.expires_in_hours * 60 * 60 * 1000).toISOString(),
        scan_count: 0
      };
      
      setQrCodes([...qrCodes, newQR]);
      setGenerateForm({
        type: 'SHIPMENT',
        reference_id: '',
        reference_type: '',
        expires_in_hours: 24,
        data: {}
      });
      
      alert(language === 'mm' 
        ? 'QR ကုဒ်ကို အောင်မြင်စွာ ဖန်တီးပြီးပါပြီ' 
        : 'QR Code generated successfully'
      );
    } catch (error) {
      console.error('Error generating QR code:', error);
      alert(language === 'mm' 
        ? 'QR ကုဒ် ဖန်တီးမှု မအောင်မြင်ပါ' 
        : 'Failed to generate QR code'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleQRScan = async (scanResult: string) => {
    try {
      setLoading(true);
      
      const newScan: ScanHistory = {
        id: Date.now().toString(),
        qr_code_id: scanResult,
        scanned_by: 'current_user',
        scanned_at: new Date().toISOString(),
        scan_result: 'SUCCESS'
      };
      
      setScanHistory([newScan, ...scanHistory]);
      setScannerActive(false);
      
      alert(language === 'mm' 
        ? 'QR ကုဒ်ကို အောင်မြင်စွာ စကင်န်ဖတ်ပြီးပါပြီ' 
        : 'QR Code scanned successfully'
      );
    } catch (error) {
      console.error('Error processing scan:', error);
      alert(language === 'mm' 
        ? 'စကင်န်ဖတ်မှု အမှားအယွင်း' 
        : 'Scan processing error'
      );
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'SCANNED': return 'bg-blue-100 text-blue-800';
      case 'EXPIRED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'SHIPMENT': return <Package className="w-4 h-4" />;
      case 'PARCEL': return <Package className="w-4 h-4" />;
      case 'VEHICLE': return <Truck className="w-4 h-4" />;
      case 'RIDER': return <User className="w-4 h-4" />;
      case 'WAREHOUSE': return <Warehouse className="w-4 h-4" />;
      default: return <QrCode className="w-4 h-4" />;
    }
  };

  const filteredQRCodes = qrCodes.filter(qr => {
    const matchesSearch = qr.reference_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         qr.qr_code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'ALL' || qr.qr_type === filterType;
    const matchesStatus = filterStatus === 'ALL' || qr.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  const renderGenerateTab = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5" />
            {t('qr.generate')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('qr.type')}
              </label>
              <select
                value={generateForm.type}
                onChange={(e) => setGenerateForm({...generateForm, type: e.target.value})}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="SHIPMENT">{t('qr.shipment')}</option>
                <option value="PARCEL">{t('qr.parcel')}</option>
                <option value="VEHICLE">{t('qr.vehicle')}</option>
                <option value="RIDER">{t('qr.rider')}</option>
                <option value="WAREHOUSE">{t('qr.warehouse')}</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('qr.referenceId')}
              </label>
              <Input
                value={generateForm.reference_id}
                onChange={(e) => setGenerateForm({...generateForm, reference_id: e.target.value})}
                placeholder={t('qr.enterReferenceId')}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('qr.referenceType')}
              </label>
              <Input
                value={generateForm.reference_type}
                onChange={(e) => setGenerateForm({...generateForm, reference_type: e.target.value})}
                placeholder={t('qr.enterReferenceType')}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">
                {t('qr.expiresInHours')}
              </label>
              <Input
                type="number"
                value={generateForm.expires_in_hours}
                onChange={(e) => setGenerateForm({...generateForm, expires_in_hours: parseInt(e.target.value)})}
                min="1"
                max="8760"
              />
            </div>
          </div>
          
          <Button 
            onClick={generateQRCode} 
            disabled={loading || !generateForm.reference_id}
            className="w-full"
            size="lg"
          >
            {loading ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <QrCode className="w-4 h-4 mr-2" />
            )}
            {t('qr.generateButton')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  const renderScanTab = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scan className="w-5 h-5" />
            {t('qr.scanQRCode')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {scannerActive ? (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <Camera className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-600 mb-4">{t('qr.scannerActive')}</p>
                <Input
                  placeholder={t('qr.enterQRCode')}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleQRScan((e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                  className="max-w-md mx-auto"
                />
              </div>
              <Button 
                variant="outline" 
                onClick={() => setScannerActive(false)}
                className="w-full"
              >
                {t('qr.closeScanner')}
              </Button>
            </div>
          ) : (
            <Button 
              onClick={() => setScannerActive(true)}
              className="w-full"
              size="lg"
            >
              <Scan className="w-4 h-4 mr-2" />
              {t('qr.startScanning')}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );

  const renderManageTab = () => (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              placeholder={t('common.search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="ALL">{t('qr.allTypes')}</option>
              <option value="SHIPMENT">{t('qr.shipment')}</option>
              <option value="PARCEL">{t('qr.parcel')}</option>
              <option value="VEHICLE">{t('qr.vehicle')}</option>
              <option value="RIDER">{t('qr.rider')}</option>
              <option value="WAREHOUSE">{t('qr.warehouse')}</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="ALL">{t('qr.allStatus')}</option>
              <option value="ACTIVE">{t('qr.active')}</option>
              <option value="SCANNED">{t('qr.scanned')}</option>
              <option value="EXPIRED">{t('qr.expired')}</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {loading ? (
          <div className="text-center py-8">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
            <p>{t('common.loading')}</p>
          </div>
        ) : filteredQRCodes.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <QrCode className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">{t('qr.noQRCodes')}</p>
            </CardContent>
          </Card>
        ) : (
          filteredQRCodes.map((qr) => (
            <Card key={qr.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {getTypeIcon(qr.qr_type)}
                      <span className="font-medium">{qr.reference_id}</span>
                      <Badge className={getStatusColor(qr.status)}>
                        {qr.status}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-600">
                      <div>
                        <span className="font-medium">{t('qr.type')}:</span>
                        <span className="ml-1">{qr.qr_type}</span>
                      </div>
                      <div>
                        <span className="font-medium">{t('qr.scans')}:</span>
                        <span className="ml-1">{qr.scan_count}</span>
                      </div>
                      <div>
                        <span className="font-medium">{t('qr.created')}:</span>
                        <span className="ml-1">{new Date(qr.created_at).toLocaleDateString()}</span>
                      </div>
                      {qr.expires_at && (
                        <div>
                          <span className="font-medium">{t('qr.expires')}:</span>
                          <span className="ml-1">{new Date(qr.expires_at).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => setSelectedQR(qr)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );

  const renderHistoryTab = () => (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            {t('qr.scanHistory')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {scanHistory.length === 0 ? (
              <div className="text-center py-8">
                <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">{t('qr.noScanHistory')}</p>
              </div>
            ) : (
              scanHistory.map((scan) => (
                <div key={scan.id} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={scan.scan_result === 'SUCCESS' ? 'default' : 'destructive'}>
                        {scan.scan_result}
                      </Badge>
                      <span className="text-sm text-gray-600">
                        {new Date(scan.scanned_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="font-medium">{t('qr.scannedBy')}:</span>
                      <span className="ml-1">{scan.scanned_by}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen bg-background relative">
      <div
        className="absolute inset-0 z-0 opacity-30"
        style={{
          backgroundImage: `url(${IMAGES.SCREENSHOT_9749})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-transparent to-background/70" />
      
      <div className="relative z-10 container mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">
            {t('qr.title')}
          </h1>
          <Button onClick={() => { loadQRCodes(); loadScanHistory(); }}>
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('common.refresh')}
          </Button>
        </div>

        <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg">
          {[
            { key: 'GENERATE', label: t('qr.generate'), icon: QrCode },
            { key: 'SCAN', label: t('qr.scan'), icon: Scan },
            { key: 'MANAGE', label: t('qr.manage'), icon: Package },
            { key: 'HISTORY', label: t('qr.history'), icon: History }
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                activeTab === key
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'GENERATE' && renderGenerateTab()}
        {activeTab === 'SCAN' && renderScanTab()}
        {activeTab === 'MANAGE' && renderManageTab()}
        {activeTab === 'HISTORY' && renderHistoryTab()}

        {selectedQR && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{t('qr.details')}</span>
                  <Button variant="ghost" onClick={() => setSelectedQR(null)}>
                    <X className="w-4 h-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600">
                      {t('qr.referenceId')}
                    </label>
                    <p className="font-mono">{selectedQR.reference_id}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">
                      {t('qr.type')}
                    </label>
                    <p>{selectedQR.qr_type}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">
                      {t('qr.status')}
                    </label>
                    <Badge className={getStatusColor(selectedQR.status)}>
                      {selectedQR.status}
                    </Badge>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600">
                      {t('qr.scanCount')}
                    </label>
                    <p>{selectedQR.scan_count}</p>
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-600">
                    {t('qr.qrCodeData')}
                  </label>
                  <pre className="bg-gray-100 p-3 rounded text-xs overflow-x-auto">
                    {JSON.stringify(selectedQR.data, null, 2)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}