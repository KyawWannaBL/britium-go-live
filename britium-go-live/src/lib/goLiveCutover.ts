export type GoLivePreviewClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{data: unknown; error: {message: string} | null}>;
};
export type GoLiveRoot = {table: 'be_data_entry_parcel_details' | 'be_pickup_requests' | 'be_wayplan_dispatches'; key: string};
export type GoLivePreview = {
  ok: true; mode: 'PREVIEW'; status: 'BLOCKED'; execution_enabled: false;
  scope_complete: false; manifest_hash: null; source_epoch: null; cutoff_at: string; expires_at: string;
  table_counts: {table: string; records: number; selected_roots: number}[];
  preserved_counts: {table: string; records: number}[];
  financial_exceptions: {code: string; detail: string}[];
  blockers: {code: string; detail: string}[];
  gates: {name: string; status: 'PASS' | 'PENDING' | 'BLOCKED' | 'FAIL'}[];
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid go-live preview response.');
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] {if (!Array.isArray(value)) throw new Error('Missing go-live preview evidence.'); return value;}
function string(value: unknown): string {if (typeof value !== 'string') throw new Error('Invalid preview evidence.'); return value;}
function count(value: unknown): number {if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid preview count.'); return value;}
export async function previewGoLiveCutover(client: GoLivePreviewClient, input: {cutoffAt: string; rootKeys: GoLiveRoot[]}): Promise<GoLivePreview> {
  const {data,error}=await client.rpc('be_go_live_cutover_preview_v2',{p_cutoff_at:input.cutoffAt,p_root_keys:input.rootKeys});
  if (error) throw new Error(error.message);
  const r=object(data);
  // This release supports only a non-executable preliminary preview. Unknown or
  // more permissive responses cannot silently enable production activation.
  if (r.ok!==true || r.mode!=='PREVIEW' || r.status!=='BLOCKED' || r.execution_enabled!==false || r.scope_complete!==false || r.manifest_hash!==null || r.source_epoch!==null) throw new Error('A verified read-only go-live preview is unavailable.');
  const exceptions=(value: unknown)=>array(value).map(x=>{const row=object(x);return {code:string(row.code),detail:string(row.detail)};});
  const cutoff_at=string(r.cutoff_at),expires_at=string(r.expires_at);
  if (!Number.isFinite(Date.parse(cutoff_at)) || !Number.isFinite(Date.parse(expires_at)) || Date.parse(expires_at)<=Date.now()) throw new Error('Invalid preview timestamp.');
  return {ok:true,mode:'PREVIEW',status:r.status as GoLivePreview['status'],execution_enabled:false,scope_complete:false,manifest_hash:null,source_epoch:null,cutoff_at,expires_at,
    table_counts:array(r.table_counts).map(x=>{const row=object(x);return {table:string(row.table),records:count(row.records),selected_roots:count(row.selected_roots)};}),
    preserved_counts:array(r.preserved_counts).map(x=>{const row=object(x);return {table:string(row.table),records:count(row.records)};}),
    financial_exceptions:exceptions(r.financial_exceptions),blockers:exceptions(r.blockers),
    gates:array(r.gates).map(x=>{const row=object(x);const status=string(row.status);if (!['PASS','PENDING','BLOCKED','FAIL'].includes(status)) throw new Error('Invalid readiness gate.'); return {name:string(row.name),status:status as GoLivePreview['gates'][number]['status']};})};
}
