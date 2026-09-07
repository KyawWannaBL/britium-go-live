import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';

export default function ManifestConverter() {
    const [isConverting, setIsConverting] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsConverting(true);
        const reader = new FileReader();

        reader.onload = (event) => {
            try {
                // 1. Read the raw Excel file
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                let jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

                // 2. Clean Ghost Rows
                jsonData = jsonData.filter(row => 
                    row['Receiver Address'] && String(row['Receiver Address']).trim() !== ''
                );

                // 3. Apply Business Rules & Standardize
                const processedData = jsonData.map(row => {
                    // Move Way ID to Ref
                    let wayId = String(row['Way ID / Pickup ID'] || '').trim();
                    let addr = String(row['Receiver Address'] || '').trim();
                    
                    if (wayId && !['NAN', 'NONE', ''].includes(wayId.toUpperCase())) {
                        if (!addr.includes(`[Ref: ${wayId}]`)) {
                            addr = `${addr} [Ref: ${wayId}]`;
                        }
                    }
                    row['Way ID / Pickup ID'] = ''; // Clear ID so portal generates new ones
                    row['Receiver Address'] = addr;

                    // Payment & Tier Rules
                    const merchant = String(row['Merchant Name'] || '').toUpperCase();
                    row['Payment Type'] = (merchant.includes('DKS') || merchant.includes('GRS')) 
                        ? 'EXACT_COLLECTION_AMOUNT' 
                        : 'ITEM_PRICE_AND_DELIVERY_CHARGES';
                    
                    row['Merchant Tier'] = 'STANDARD';
                    row['Service Type'] = 'STANDARD';
                    
                    // Default Provider
                    const providerKey = 'မြို့နယ် / ဝန်ဆောင်မှုပေးသူ\n(Township / Service Provider)';
                    if (!row[providerKey] || String(row[providerKey]).trim() === '') {
                        row[providerKey] = 'Britium Express';
                    }

                    return row;
                });

                // 4. Generate the Cleaned Excel File
                const newSheet = XLSX.utils.json_to_sheet(processedData);
                const newWorkbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(newWorkbook, newSheet, "Cleaned Manifest");
                
                // 5. Trigger Browser Download
                XLSX.writeFile(newWorkbook, "READY_TO_UPLOAD_Cleaned.xlsx");
                
                alert(`Successfully cleaned ${processedData.length} valid rows.`);
            } catch (error) {
                console.error("Conversion failed:", error);
                alert("Error converting manifest. Please check file format.");
            } finally {
                setIsConverting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };

        reader.readAsArrayBuffer(file);
    };

    return (
        <div>
            <input 
                type="file" 
                accept=".xlsx, .xls" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                onChange={handleFileUpload} 
            />
            <button 
                onClick={() => fileInputRef.current.click()}
                disabled={isConverting}
                style={{
                    backgroundColor: '#0b2236',
                    color: '#4ade80', // Britium Green text
                    border: '1px solid #1a3a5c',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    cursor: isConverting ? 'wait' : 'pointer',
                    fontWeight: 'bold'
                }}
            >
                {isConverting ? 'CONVERTING...' : '📄 CONVERT INBOUND MANIFEST'}
            </button>
        </div>
    );
}
