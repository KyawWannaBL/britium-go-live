/**
 * Compatibility export for legacy imports.
 *
 * All browser code must share the same Supabase Auth client and storage key.
 * The canonical singleton is src/lib/supabaseClient.ts.
 */
import { supabase } from "@/lib/supabaseClient";

export { supabase };
export default supabase;
