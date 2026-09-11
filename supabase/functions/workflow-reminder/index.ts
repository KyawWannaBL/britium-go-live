import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(url, serviceRole);

    const nowIso = new Date().toISOString();

    const { data: pending, error } = await supabase
      .from("workflow_acknowledgements")
      .select("*")
      .eq("status", "pending")
      .lte("due_at", nowIso)
      .limit(200);

    if (error) throw error;

    let processed = 0;

    for (const ack of pending ?? []) {
      const nextReminder = Number(ack.reminder_count || 0) + 1;

      const { error: updateErr } = await supabase
        .from("workflow_acknowledgements")
        .update({
          reminder_count: nextReminder,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ack.id);

      if (updateErr) throw updateErr;

      const titleEn = "Workflow acknowledgement pending";
      const titleMm = "Workflow acknowledgement စောင့်ဆိုင်းနေသည်";
      const bodyEn = `Please accept or complete process responsibility. Reminder #${nextReminder}`;
      const bodyMm = `လုပ်ငန်းတာဝန်ကို လက်ခံပါ သို့မဟုတ် ပြီးစီးကြောင်းအတည်ပြုပါ။ Reminder #${nextReminder}`;

      const { error: noteErr } = await supabase
        .from("ops_notifications")
        .insert({
          staff_id: ack.responsible_staff_id,
          category: "workflow-reminder",
          title_en: titleEn,
          title_mm: titleMm,
          body_en: bodyEn,
          body_mm: bodyMm,
          related_entity_type: "workflow_acknowledgement",
          related_entity_id: ack.id,
          is_read: false,
        });

      if (noteErr) throw noteErr;
      processed += 1;
    }

    return new Response(
      JSON.stringify({ ok: true, processed }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: String(error) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});
