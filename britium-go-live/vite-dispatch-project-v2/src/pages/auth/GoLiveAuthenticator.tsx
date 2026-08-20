// pages/auth/GoLiveAuthenticator.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import { ShieldCheck, UserCog, KeyRound } from 'lucide-react';

import PortalLayoutGoLive from '@/components/layout/PortalLayoutGoLive';

export default function GoLiveAuthenticator() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isSimMode, setIsSimMode] = useState(true); // Default to Sim Mode for E2E testing
  const [staffList, setStaffList] = useState<any[]>([]);
  const [selectedStaff, setSelectedStaff] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch seeded staff for the Simulation Dropdown
  useEffect(() => {
    const loadStaff = async () => {
      const { data } = await supabase
        .from('be_mobile_workforce_accounts')
        .select('*')
        .order('role', { ascending: true });
      if (data) setStaffList(data);
    };
    loadStaff();
  }, []);

  const handleSimulationLogin = () => {
    if (!selectedStaff) {
      toast({ title: 'Select Staff', description: 'Please select a staff member to simulate.', variant: 'destructive' });
      return;
    }
    const userProfile = staffList.find(s => s.user_id === selectedStaff);
    setCurrentUser(userProfile);
    toast({ title: 'Simulation Active', description: `Logged in as ${userProfile.full_name} (${userProfile.role})` });
  };

  const handleProductionLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Authenticate with Supabase Auth
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) throw authErr;

      // 2. Fetch RBAC Profile from our seeded table
      const { data: profile, error: profileErr } = await supabase
        .from('be_mobile_workforce_accounts')
        .select('*')
        .eq('user_id', authData.user.id) // Maps to the UUID
        .single();

      if (profileErr || !profile) throw new Error("Staff profile not found or inactive.");

      setCurrentUser(profile);
      toast({ title: 'Login Successful', description: `Welcome back, ${profile.full_name}` });
    } catch (error: any) {
      toast({ title: 'Authentication Failed', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    supabase.auth.signOut();
    setCurrentUser(null);
  };

  // If logged in, render the main portal layout and pass the user context
  if (currentUser) {
    // We clone the element to inject the logout handler into the sidebar
    return (
      <div className="relative">
        <div className="absolute top-4 right-4 z-50 md:hidden">
           <Button size="sm" variant="destructive" onClick={handleLogout}>Exit</Button>
        </div>
        <PortalLayoutGoLive currentUser={currentUser} onLogout={handleLogout} />
      </div>
    );
  }

  // Otherwise, render the Login Screen
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
        <div className="bg-blue-900 p-6 text-center text-white">
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-blue-300" />
          <h1 className="text-2xl font-bold tracking-wider">BRITIUM EXPRESS</h1>
          <p className="text-blue-200 text-sm mt-1">Enterprise Operations Portal</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Toggle between Production and Simulation */}
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button 
              className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${isSimMode ? 'bg-white shadow-sm text-blue-900' : 'text-gray-500'}`}
              onClick={() => setIsSimMode(true)}
            >
              <UserCog className="w-4 h-4 inline-block mr-2" /> E2E Simulator
            </button>
            <button 
              className={`flex-1 py-2 text-sm font-semibold rounded-md transition-all ${!isSimMode ? 'bg-white shadow-sm text-blue-900' : 'text-gray-500'}`}
              onClick={() => setIsSimMode(false)}
            >
              <KeyRound className="w-4 h-4 inline-block mr-2" /> Production Login
            </button>
          </div>

          {isSimMode ? (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-100 p-3 rounded text-sm text-blue-800">
                <strong>Testing Mode:</strong> Select a seeded staff profile to instantly log in and test their specific RBAC dashboard.
              </div>
              <div>
                <label className="text-sm font-semibold block mb-2">Select Persona</label>
                <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                  <SelectTrigger><SelectValue placeholder="Choose a staff member..." /></SelectTrigger>
                  <SelectContent>
                    {staffList.map(staff => (
                      <SelectItem key={staff.user_id} value={staff.user_id}>
                        {staff.role} - {staff.full_name} ({staff.branch_code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSimulationLogin} className="w-full bg-blue-600 hover:bg-blue-700">
                Simulate Session
              </Button>
            </div>
          ) : (
            <form onSubmit={handleProductionLogin} className="space-y-4">
              <div>
                <label className="text-sm font-semibold block mb-1">Email Address</label>
                <Input type="email" required value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-semibold block mb-1">Password</label>
                <Input type="password" required value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-blue-900 hover:bg-blue-800">
                {loading ? 'Authenticating...' : 'Secure Login'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}