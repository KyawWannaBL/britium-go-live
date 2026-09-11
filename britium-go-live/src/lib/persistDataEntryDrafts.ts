/** Persist complete import rows before map review. Stable keys make retries safe. */
export async function persistDataEntryDrafts(client: any, rows: Array<Record<string, any>>) {
  const pending = rows.filter(row => !row.saved && row.importedFromOs && row.sourceFileName);
  if (!pending.length) return 0;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw error || new Error('Sign in to preserve the import.');
  let saved = 0;
  for (let offset = 0; offset < pending.length; offset += 50) {
    const group = pending.slice(offset, offset + 50);
    const result = await client.from('be_data_entry_pending_drafts').upsert(group.map(row => ({
      owner_id: data.user.id, pickup_id: row.pickup_id, parcel_sequence: row.parcel_sequence,
      skipped: Boolean(row.skipped), updated_at: new Date().toISOString(),
      snapshot: {...row, saved:false, checking:false, calculating:false},
    })), {onConflict:'owner_id,pickup_id,parcel_sequence'});
    if (result.error) throw new Error(`${saved}/${pending.length} import drafts preserved. Retry the import to continue safely: ${result.error.message}`);
    saved += group.length;
  }
  return saved;
}
