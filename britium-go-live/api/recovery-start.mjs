const headers = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Type": "text/html; charset=utf-8",
};

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default {
  async fetch(req) {
    if (req.method !== "GET") {
      return new Response("method_not_allowed", { status: 405, headers });
    }

    const url = new URL(req.url);
    const tokenHash = String(url.searchParams.get("token_hash") || "").trim();
    const type = String(url.searchParams.get("type") || "").trim();

    if (!tokenHash || type !== "recovery") {
      return new Response(
        "<!doctype html><html><body><h1>Invalid recovery link</h1><p>Please request a new password reset email.</p></body></html>",
        { status: 400, headers }
      );
    }

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex,nofollow">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Britium Password Recovery</title>
<style>
body{font-family:system-ui,sans-serif;background:#061524;color:#eef8ff;margin:0;display:grid;place-items:center;min-height:100vh}
main{width:min(520px,calc(100% - 32px));background:#0b2236;border:1px solid #1a3a5c;border-radius:24px;padding:28px;box-sizing:border-box}
button{width:100%;height:52px;border:0;border-radius:14px;background:#f6b84b;color:#061524;font-weight:800;cursor:pointer}
p{color:#9bb7cc;line-height:1.5}
</style>
</head>
<body>
<main>
<h1>Continue password recovery</h1>
<p>For security, this link has not been used yet. Continue only if you requested a Britium password reset.</p>
<form method="post" action="/api/recovery-verify">
<input type="hidden" name="token_hash" value="${esc(tokenHash)}">
<input type="hidden" name="type" value="recovery">
<button type="submit">Continue securely</button>
</form>
</main>
</body>
</html>`;

    return new Response(html, { status: 200, headers });
  },
};
