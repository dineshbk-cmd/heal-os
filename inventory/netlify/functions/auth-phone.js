// netlify/functions/auth-phone.js
// "Sign in / reset password with mobile number". Supabase signs people in by
// email, so this server-side function looks up the email that belongs to a
// mobile number (using the service-role key, which never reaches the browser)
// and then talks to Supabase Auth on the user's behalf. The email itself is
// never sent back to the browser.

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function normalizePhone(p) {
  const raw = String(p || "").replace(/[^\d+]/g, "");
  if (raw.startsWith("+")) return raw;
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return "+91" + d;
  if (d.length === 12 && d.startsWith("91")) return "+" + d;
  return d;
}

export default async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return json(500, { error: "Mobile sign-in is not configured on the server" });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Bad JSON" }); }
  const phone = normalizePhone(body.phone);
  if (!/^\+\d{10,15}$/.test(phone)) return json(400, { error: "Enter a valid mobile number" });

  const r = await fetch(`${url}/rest/v1/profiles?select=email,status&phone=eq.${encodeURIComponent(phone)}`, {
    headers: { apikey: service, Authorization: `Bearer ${service}` },
  });
  const rows = r.ok ? await r.json() : [];
  const email = rows[0]?.email;

  if (body.action === "login") {
    if (!email) return json(400, { error: "Invalid login credentials" });
    const t = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: String(body.password || "") }),
    });
    const data = await t.json().catch(() => ({}));
    if (!t.ok) return json(400, { error: data.error_description || data.msg || "Invalid login credentials" });
    return json(200, { access_token: data.access_token, refresh_token: data.refresh_token });
  }

  if (body.action === "reset") {
    if (email) {
      // Reset link always returns to this same site (no open redirect)
      const origin = new URL(req.url).origin;
      await fetch(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent(origin)}`, {
        method: "POST",
        headers: { apikey: anon, "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    }
    // Same answer whether or not the number exists
    return json(200, { ok: true });
  }

  return json(400, { error: "Unknown action" });
};
