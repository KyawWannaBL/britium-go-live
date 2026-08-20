import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCw, Upload } from "lucide-react";

export default function MasterDataManagementPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function syncMasterData() {
    setLoading(true);
    const { data: records } = await supabase.from('be_master_data_registry').select('*');
    setData(records || []);
    setLoading(false);
  }

  useEffect(() => { syncMasterData(); }, []);

  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-black">Master Data Registry</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={syncMasterData}><RefreshCw size={16} className="mr-2"/> Refresh</Button>
          <Button><Upload size={16} className="mr-2"/> Bulk Upload CSV</Button>
        </div>
      </div>

      <div className="border rounded-xl shadow-sm bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Module</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-bold">{r.module_key}</TableCell>
                <TableCell>{r.record_code}</TableCell>
                <TableCell>{r.display_name}</TableCell>
                <TableCell>{r.is_active ? 'Active' : 'Inactive'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}