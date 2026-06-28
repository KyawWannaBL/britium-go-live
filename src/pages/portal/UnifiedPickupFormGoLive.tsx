// pages/portal/UnifiedPickupFormGoLive.tsx
import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

export default function UnifiedPickupFormGoLive({ role, merchantCode }: { role: string, merchantCode: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    customerName: '', phone: '', city: 'Yangon', township: '', address: '', weight: '', tier: 'Standard', highwayDropoff: false
  });

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Trigger the unified RPC defined in our SQL Go-Live script
      const { data, error } = await supabase.rpc('be_submit_unified_pickup_request', {
        p_merchant_code: merchantCode || 'GUEST',
        p_customer_name: formData.customerName,
        p_phone: formData.phone,
        p_city: formData.city,
        p_township: formData.township,
        p_address: formData.address,
        p_weight_kg: parseFloat(formData.weight) || 1,
        p_tier: formData.tier,
        p_highway_dropoff: formData.highwayDropoff,
        p_submitted_by_role: role
      });

      if (error) throw error;

      toast({ 
        title: 'Pickup Requested Successfully', 
        description: `Tracking ID: ${data.pickup_id} routed to ${data.branch} branch.` 
      });

      // Reset form
      setFormData({
        customerName: '', phone: '', city: 'Yangon', township: '', address: '', weight: '', tier: 'Standard', highwayDropoff: false
      });
    } catch (error: any) {
      toast({ title: 'Submission Failed', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto bg-white border rounded-xl shadow-sm">
      <h2 className="text-xl font-bold mb-6">Create New Pickup Request</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold mb-1 block">Customer Name</label>
            <Input required value={formData.customerName} onChange={(e) => handleChange('customerName', e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-semibold mb-1 block">Phone Number</label>
            <Input required value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold mb-1 block">City (Routes automatically)</label>
            <Select value={formData.city} onValueChange={(v) => handleChange('city', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Yangon">Yangon</SelectItem>
                <SelectItem value="Mandalay">Mandalay</SelectItem>
                <SelectItem value="Naypyitaw">Naypyitaw</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-semibold mb-1 block">Township</label>
            <Input required value={formData.township} onChange={(e) => handleChange('township', e.target.value)} />
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold mb-1 block">Full Address</label>
          <Input required value={formData.address} onChange={(e) => handleChange('address', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg border">
          <div>
            <label className="text-sm font-semibold mb-1 block">Weight (kg)</label>
            <Input type="number" step="0.1" required value={formData.weight} onChange={(e) => handleChange('weight', e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-semibold mb-1 block">Service Tier</label>
            <Select value={formData.tier} onValueChange={(v) => handleChange('tier', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Standard">Standard</SelectItem>
                <SelectItem value="Royal">Royal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex items-center gap-2 mt-2">
            <Checkbox 
              id="highway" 
              checked={formData.highwayDropoff} 
              onCheckedChange={(c) => handleChange('highwayDropoff', !!c)} 
            />
            <label htmlFor="highway" className="text-sm font-medium leading-none cursor-pointer">
              Includes Highway Drop-off Surcharge
            </label>
          </div>
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full mt-4">
          {isSubmitting ? 'Submitting to Network...' : 'Confirm Pickup Request'}
        </Button>
      </form>
    </div>
  );
}