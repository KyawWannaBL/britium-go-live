const pageHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Type": "text/html; charset=utf-8",
};

function page(title, message, body = "") {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;background:#061524;color:#eef8ff;margin:0;display:grid;place-items:center;min-height:100vh}main{width:min(520px,calc(100% - 32px));background:#0b2236;border:1px solid #1a3a5c;border-radius:24px;padding:28px;box-sizing:border-box}input{width:100%;height:50px;margin-top:8px;margin-bottom:16px;border-radius:12px;border:1px solid #1a3a5c;background:#fff;color:#000;padding:0 14px;box-sizing:border-box}button{width:100%;height:52px;border:0;border-radius:14px;background:#f6b84b;color:#061524;font-weight:800;cursor:pointer}p{color:#9bb7cc;line-height:1.5}label{display:block;font-weight:700}</style></head><body><main><h1>${title}</h1><p>${message}</p>${body}</main></body></html>`;
}

export default {
  async fetch(req) {
    if (req.method !== "POST") {
      return new Response(page("Method not allowed", "Please open the password-recovery link from your email."), {
        status: 405,
        headers: pageHeaders,
      });
    }

    try {
      const form = await req.formData();
      const tokenHash = String(form.get("token_hash") || "").trim();
      const type = String(form.get("type") || "").trim();

      if (!tokenHash || type !== "recovery") {
        return new Response(page("Invalid recovery link", "Please request a new password reset email."), {
          status: 400,
          headers: pageHeaders,
        });
      }

      const u = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
      const k = String(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "").trim();

      if (!u || !k) {
        console.error("[Britium recovery verify] missing_supabase_env");
        return new Response(page("Recovery unavailable", "The recovery service is temporarily unavailable. Please try again later."), {
          status: 500,
          headers: pageHeaders,
        });
      }

      const r = await fetch(u + "/auth/v1/verify", {
        method: "POST",
        headers: {
          apikey: k,
          Authorization: "Bearer " + k,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token_hash: tokenHash, type: "recovery" }),
      });

      const text = await r.text();

      if (!r.ok) {
        console.error("[Britium recovery verify]", r.status);
        return new Response(page("Recovery link expired", "This recovery link is invalid or has already been used. Please request a new password reset email."), {
          status: 400,
          headers: pageHeaders,
        });
      }

      let data = {};
      try {
        data = JSON.parse(text);
      } catch {}

      const access = String(data.access_token || "");
      if (!access) {
        console.error("[Britium recovery verify] access_token_missing");
        return new Response(page("Recovery unavailable", "The recovery session could not be created. Please request a new reset link."), {
          status: 502,
          headers: pageHeaders,
        });
      }

      const headers = new Headers(pageHeaders);
      headers.set(
        "Set-Cookie",
        "britium_recovery_access=" + encodeURIComponent(access) + "; Path=/api/recovery-update-password; HttpOnly; Secure; SameSite=Lax; Max-Age=600"
      );

      const formHtml = `<form method="post" action="/api/recovery-update-password"><label>New password<input name="password" type="password" minlength="8" autocomplete="new-password" required></label><label>Confirm password<input name="confirm_password" type="password" minlength="8" autocomplete="new-password" required></label><button type="submit">Update password</button></form>`;

      return new Response(page("Set a new password", "Enter a new password for your Britium account.", formHtml), {
        status: 200,
        headers,
      });
    } catch (e) {
      console.error("[Britium recovery verify]", e);
      return new Response(page("Recovery unavailable", "The recovery service is temporarily unavailable. Please try again later."), {
        status: 500,
        headers: pageHeaders,
      });
    }
  },
};
