// src/lib/dashboardApi.ts
import { supabase } from '@/lib/supabaseClient';

export interface DashboardKpi {
  total_pickups_today: number; pending_pickups: number; active_shipments: number;
  delivered_today: number; failed_today: number; returned_today: number;
  pending_cod: number; active_riders: number; exceptions_open: number; as_of: string;
}
export interface TrendDay { day: string; delivered: number; failed: number; active: number; }
export interface ModuleThroughput { source: string; total: number; delivered: number; failed: number; }
export interface ActivityItem { id: string; event_type: string; pickup_id: string; description: string; actor_role: string; created_at: string; merchant_name: string; current_status: string; }
export interface SlaSummary { total_delivered_7d: number; within_24h: number; within_48h: number; over_48h: number; }

export async function fetchDashboardKpi(): Promise<DashboardKpi> {
  const { data, error } = await supabase.rpc('be_dashboard_kpi_today');
  if (error) throw error;
  return data as DashboardKpi;
}
export async function fetchTrend7d(): Promise<TrendDay[]> {
  const { data, error } = await supabase.rpc('be_dashboard_trend_7d');
  if (error) throw error;
  return (data as TrendDay[]) ?? [];
}
export async function fetchModuleThroughput(): Promise<ModuleThroughput[]> {
  const { data, error } = await supabase.rpc('be_dashboard_module_throughput');
  if (error) throw error;
  return (data as ModuleThroughput[]) ?? [];
}
export async function fetchActivityFeed(limit = 20): Promise<ActivityItem[]> {
  const { data, error } = await supabase.rpc('be_dashboard_activity_feed', { p_limit: limit });
  if (error) throw error;
  return (data as ActivityItem[]) ?? [];
}
export async function fetchSlaSummary(): Promise<SlaSummary> {
  const { data, error } = await supabase.rpc('be_dashboard_sla_summary');
  if (error) throw error;
  return data as SlaSummary;
}
