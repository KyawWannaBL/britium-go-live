import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useEnhancedAuth } from "@/hooks/useEnhancedAuth";
import {
  User,
  Star,
  Wallet,
  TrendingUp,
  MapPin,
  Package,
  Award,
  AlertOctagon,
  Clock,
  ShieldCheck,
  CheckCircle2,
  DollarSign,
  CreditCard,
  MessageSquare,
  Loader2,
} from "lucide-react";

function normalizeRole(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
}

// 1. RIDER PROFILE
const RiderProfile = ({ userId }: { userId: string }) => {
  const [profile, setProfile] = useState<any>(null);
  const [wallet, setWallet] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRiderData() {
      try {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name, phone, avatar_url, vehicle_no, driver_id, rating")
          .eq("id", userId)
          .single();

        const { data: walletData } = await supabase
          .from("rider_wallets")
          .select("*")
          .eq("rider_id", userId)
          .single();

        const { data: reviewsData } = await supabase
          .from("rider_reviews")
          .select("reviewer_name, rating, comment, created_at")
          .eq("rider_id", userId)
          .order("created_at", { ascending: false })
          .limit(5);

        setProfile(profileData);
        setWallet(walletData || { balance: 0, success_comm: 0, perf_bonus: 0, fines: 0 });
        setReviews(reviewsData || []);
      } catch (error) {
        console.error("Error fetching rider data:", error);
      } finally {
        setLoading(false);
      }
    }

    void fetchRiderData();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="animate-spin text-sky-600" />
      </div>
    );
  }

  if (!profile) {
    return <div className="p-10 text-center text-slate-500">Profile not found.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center">
        <div className="relative h-24 w-24 shrink-0">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt="Rider"
              className="h-full w-full rounded-full border-4 border-slate-50 object-cover shadow-md"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-full border-4 border-slate-50 bg-slate-100 text-slate-400 shadow-md">
              <User size={32} />
            </div>
          )}

          <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-emerald-500 text-white">
            <CheckCircle2 size={16} />
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-black text-[#0d2c54]">
              {profile.full_name || "Unknown Rider"}
            </h2>
            <span className="rounded-full bg-sky-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-sky-700">
              Rider
            </span>
          </div>

          <p className="mt-1 text-sm font-medium text-slate-500">
            Vehicle: {profile.vehicle_no || "N/A"} • ID: {profile.driver_id || "N/A"}
          </p>

          <div className="mt-3 flex items-center gap-2">
            <div className="flex items-center text-[#ffd700]">
              <Star size={18} fill="currentColor" />
            </div>
            <span className="text-sm font-bold text-slate-700">
              {profile.rating ? profile.rating.toFixed(1) : "New"} / 5.0
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-12">
        <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#0d2c54_0%,#0a2343_100%)] p-6 text-white shadow-xl md:col-span-7">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-sky-300">
              <Wallet size={16} />
              Rider Wallet
            </h3>
            <span className="text-xs text-slate-400">Current Balance</span>
          </div>

          <div className="mt-6">
            <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              Net Earnings Available
            </p>
            <h1 className="mt-1 text-4xl font-black text-[#ffd700]">
              {(wallet?.balance || 0).toLocaleString()} <span className="text-lg">MMK</span>
            </h1>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-emerald-400">
                <TrendingUp size={14} />
                <span className="text-[10px] font-bold uppercase">Success Comm</span>
              </div>
              <p className="text-lg font-bold">+ {(wallet?.success_comm || 0).toLocaleString()}</p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-sky-400">
                <Award size={14} />
                <span className="text-[10px] font-bold uppercase">Perf. Bonus</span>
              </div>
              <p className="text-lg font-bold">+ {(wallet?.perf_bonus || 0).toLocaleString()}</p>
            </div>

            <div className="rounded-2xl border border-rose-500/30 bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-rose-400">
                <AlertOctagon size={14} />
                <span className="text-[10px] font-bold uppercase">Fines / Pens</span>
              </div>
              <p className="text-lg font-bold">- {(wallet?.fines || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm md:col-span-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
            <MessageSquare size={16} />
            Recent Feedback
          </h3>

          <div className="max-h-[240px] space-y-4 overflow-y-auto pr-2">
            {reviews.length === 0 ? (
              <p className="text-xs text-slate-500">No recent feedback.</p>
            ) : (
              reviews.map((review, i) => (
                <div key={i} className="border-b border-slate-100 pb-4 last:border-0">
                  <div className="mb-1 flex items-start justify-between">
                    <span className="text-sm font-bold text-[#0d2c54]">{review.reviewer_name}</span>
                    <span className="text-xs text-slate-400">
                      {new Date(review.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="mb-2 flex text-[#ffd700]">
                    {[...Array(5)].map((_, idx) => (
                      <Star
                        key={idx}
                        size={12}
                        fill={idx < review.rating ? "currentColor" : "none"}
                        className={idx >= review.rating ? "text-slate-200" : ""}
                      />
                    ))}
                  </div>

                  <p className="text-xs leading-relaxed text-slate-600">"{review.comment}"</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// 2. MERCHANT PROFILE
const MerchantProfile = ({ userId }: { userId: string }) => {
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMerchantData() {
      try {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name, phone, company_name")
          .eq("id", userId)
          .single();

        const { data: statsData } = await supabase
          .from("merchant_stats")
          .select("*")
          .eq("merchant_id", userId)
          .single();

        setProfile(profileData);
        setStats(
          statsData || {
            pending_cod: 0,
            outstanding_fees: 0,
            total_ways: 0,
            success_rate: 0,
            return_rate: 0,
          }
        );
      } catch (error) {
        console.error("Error fetching merchant data:", error);
      } finally {
        setLoading(false);
      }
    }

    void fetchMerchantData();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="animate-spin text-sky-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-2xl font-black uppercase text-indigo-700">
          {profile?.company_name?.[0] || profile?.full_name?.[0] || "M"}
        </div>
        <div>
          <h2 className="text-2xl font-black text-[#0d2c54]">
            {profile?.company_name || profile?.full_name}
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Enterprise Partner • {profile?.phone}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-6 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
            <DollarSign size={16} />
            Financial Settlement
          </h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <div>
                <p className="text-[10px] font-bold uppercase text-emerald-600">
                  Pending COD to Receive
                </p>
                <p className="text-2xl font-black text-emerald-700">
                  {(stats?.pending_cod || 0).toLocaleString()} Ks
                </p>
              </div>
              <button className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-500">
                Withdraw
              </button>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-rose-100 bg-rose-50 p-4">
              <div>
                <p className="text-[10px] font-bold uppercase text-rose-600">
                  Outstanding Delivery Fees
                </p>
                <p className="text-xl font-bold text-rose-700">
                  {(stats?.outstanding_fees || 0).toLocaleString()} Ks
                </p>
              </div>
              <button className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-bold text-rose-600 transition hover:bg-rose-100">
                Pay Now
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-6 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
            <Package size={16} />
            Business Analytics
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-3xl font-black text-[#0d2c54]">
                {(stats?.total_ways || 0).toLocaleString()}
              </p>
              <p className="mt-1 text-xs font-bold text-slate-500">Total Ways (Month)</p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-3xl font-black text-emerald-600">{stats?.success_rate || 0}%</p>
              <p className="mt-1 text-xs font-bold text-slate-500">Delivery Success Rate</p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-3xl font-black text-rose-500">{stats?.return_rate || 0}%</p>
              <p className="mt-1 text-xs font-bold text-slate-500">Return Rate</p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-3xl font-black text-sky-600">Active</p>
              <p className="mt-1 text-xs font-bold text-slate-500">API Integration</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// 3. CUSTOMER PROFILE
const CustomerProfile = ({ userId }: { userId: string }) => {
  const [profile, setProfile] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCustomerData() {
      try {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("full_name, phone")
          .eq("id", userId)
          .single();

        setProfile(profileData);

        if (!profileData?.phone) {
          setHistory([]);
          setAddresses([]);
          return;
        }

        const { data: waysData } = await supabase
          .from("shipments")
          .select("id, tracking_number, sender_name, status, created_at")
          .or(`recipient_phone.eq.${profileData.phone},sender_phone.eq.${profileData.phone}`)
          .order("created_at", { ascending: false })
          .limit(3);

        const { data: addrData } = await supabase
          .from("customer_addresses")
          .select("*")
          .eq("customer_id", userId);

        setHistory(waysData || []);
        setAddresses(addrData || []);
      } catch (error) {
        console.error("Error fetching customer data:", error);
      } finally {
        setLoading(false);
      }
    }

    void fetchCustomerData();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex justify-center p-10">
        <Loader2 className="animate-spin text-sky-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-pink-100 text-pink-700">
          <User size={32} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-[#0d2c54]">
            {profile?.full_name || "Customer"}
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Personal Account • {profile?.phone}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
            <Clock size={16} />
            Recent Deliveries
          </h3>

          <div className="space-y-4">
            {history.length === 0 ? (
              <p className="text-xs text-slate-500">No recent deliveries found.</p>
            ) : (
              history.map((way) => (
                <div key={way.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 flex items-start justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-500">{way.tracking_number}</p>
                      <p className="text-sm font-black text-[#0d2c54]">From: {way.sender_name}</p>
                    </div>
                    <span className="rounded bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">
                      {String(way.status).replace(/_/g, " ")}
                    </span>
                  </div>

                  {way.status === "DELIVERED" && (
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <p className="mb-2 text-xs font-bold text-slate-600">Rate your rider:</p>
                      <div className="flex cursor-pointer gap-1 text-slate-300">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} size={20} className="transition hover:text-[#ffd700]" />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
            <MapPin size={16} />
            Saved Addresses
          </h3>

          <div className="space-y-3">
            {addresses.map((addr) => (
              <div
                key={addr.id}
                className="relative overflow-hidden rounded-2xl border border-sky-200 bg-sky-50 p-4"
              >
                {addr.is_default && <div className="absolute left-0 top-0 h-full w-1 bg-sky-500" />}
                <p className="mb-1 text-xs font-black uppercase text-sky-700">
                  {addr.label || "Saved Address"}
                </p>
                <p className="text-sm font-bold text-slate-700">{addr.address}</p>
                <p className="mt-1 text-xs text-slate-500">{addr.township}</p>
              </div>
            ))}

            <button className="w-full rounded-2xl border-2 border-dashed border-slate-200 py-3 text-sm font-bold text-slate-500 transition hover:bg-slate-50">
              + Add New Address
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// 4. FINANCE / ADMIN PROFILE
const FinanceProfile = ({ userId }: { userId: string }) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFinanceData() {
      try {
        const { data } = await supabase.rpc("get_finance_summary");
        setStats(data || { total_cod: 0, pending_payouts: 0, system_revenue: 0 });
      } catch (error) {
        console.error("Error fetching finance stats:", error);
      } finally {
        setLoading(false);
      }
    }

    void fetchFinanceData();
  }, [userId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0d2c54] text-white">
          <ShieldCheck size={32} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-[#0d2c54]">Admin / Finance Portal</h2>
          <p className="mt-1 text-sm font-medium text-slate-500">Authorized Access Level</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="animate-spin text-sky-600" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
              Total COD Holding
            </p>
            <p className="mt-2 text-3xl font-black text-[#0d2c54]">
              {(stats?.total_cod || 0).toLocaleString()} <span className="text-sm">MMK</span>
            </p>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
              Pending Payouts
            </p>
            <p className="mt-2 text-3xl font-black text-rose-600">
              {(stats?.pending_payouts || 0).toLocaleString()} <span className="text-sm">MMK</span>
            </p>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
              System Revenue (MTD)
            </p>
            <p className="mt-2 text-3xl font-black text-emerald-600">
              {(stats?.system_revenue || 0).toLocaleString()} <span className="text-sm">MMK</span>
            </p>
          </div>
        </div>
      )}

      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-slate-400">
          <CreditCard size={16} />
          Quick Finance Actions
        </h3>

        <div className="flex gap-4">
          <button className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 py-4 font-bold text-slate-700 transition hover:bg-slate-100">
            Process Merchant COD
          </button>
          <button className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 py-4 font-bold text-slate-700 transition hover:bg-slate-100">
            Approve Rider Payroll
          </button>
          <button className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 py-4 font-bold text-slate-700 transition hover:bg-slate-100">
            Audit Logs
          </button>
        </div>
      </div>
    </div>
  );
};

// --- MAIN WRAPPER ---
export default function ProfileDashboard() {
  const { user, roleCode } = useEnhancedAuth();

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-[#0d2c54]" />
      </div>
    );
  }

  const normalizedRole = normalizeRole(
    roleCode ||
      user?.user_metadata?.roleCode ||
      user?.user_metadata?.role_code ||
      user?.user_metadata?.app_role ||
      user?.user_metadata?.user_role ||
      user?.user_metadata?.role
  );

  const isRider = ["RIDER", "DRIVER", "CUR"].includes(normalizedRole);
  const isMerchant = ["MER", "MERCHANT"].includes(normalizedRole);
  const isCustomer = ["CUS", "CUSTOMER"].includes(normalizedRole);
  const isFinanceOrAdmin = [
    "FINM",
    "SYS",
    "SUPER_ADMIN",
    "ADMIN",
    "APP_OWNER",
    "SUPER_A",
    "ADM",
    "MGR",
    "AUTHENTICATED",
    "USER",
  ].includes(normalizedRole);

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        {isRider && <RiderProfile userId={user.id} />}
        {isMerchant && <MerchantProfile userId={user.id} />}
        {isCustomer && <CustomerProfile userId={user.id} />}
        {isFinanceOrAdmin && <FinanceProfile userId={user.id} />}

        {!isRider && !isMerchant && !isCustomer && !isFinanceOrAdmin && (
          <div className="rounded-[28px] border border-slate-200 bg-white p-10 text-center shadow-sm">
            <h2 className="text-xl font-black text-[#0d2c54]">Welcome to your Profile</h2>
            <p className="mt-2 text-slate-500">
              Your current role access ({normalizedRole || "UNKNOWN"}) does not have a
              specialized dashboard view yet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}