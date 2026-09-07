import React from 'react';

export const handleFillRows = (spreadsheetData, selectedTarget, currentUser, submitToBackendAPI) => {
    if (selectedTarget === 'BULK_UPLOAD_MATCH') {
        const invalidRows = spreadsheetData.filter(row => 
            !row['Way ID / Pickup ID'] || row['Way ID / Pickup ID'].trim() === ''
        );

        if (invalidRows.length > 0) {
            alert(`Missing IDs: ${invalidRows.length} rows lack a predefined Pickup ID.`);
            return; 
        }

        submitToBackendAPI({ mode: 'STRICT_MATCH', data: spreadsheetData });
    } else {
        const processedData = spreadsheetData.map(row => ({
            ...row, 'Way ID / Pickup ID': selectedTarget
        }));
        submitToBackendAPI({ mode: 'SINGLE_TARGET', data: processedData });
    }
};

export default function TargetPickupDropdown({ activePickups = [], currentUser, selectedTarget, setSelectedTarget }) {
    const AUTHORIZED_BULK_ROLES = ['superadmin', 'operation_manager'];
    
    // Safely extract the role, default to an empty string if undefined, then lowercase and trim
    const safeRole = (currentUser?.role || '').toLowerCase().trim();
    const canUseBulkUpload = AUTHORIZED_BULK_ROLES.includes(safeRole);

    return (
        <select value={selectedTarget} onChange={(e) => setSelectedTarget(e.target.value)}>
            <option value="" disabled>Select Target Pickup...</option>
            
            {activePickups.map(pickup => (
                <option key={pickup.id} value={pickup.id}>
                    {pickup.id} - {pickup.merchant}
                </option>
            ))}
            
            {canUseBulkUpload && (
                <option value="BULK_UPLOAD_MATCH">Bulk upload - match Way ID + Merchant</option>
            )}
        </select>
    );
}