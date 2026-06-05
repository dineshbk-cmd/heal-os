// netlify/functions/claude.js
// Server-side relay. Holds your Anthropic API key (as an environment
// variable) so it is NEVER exposed in the browser. The React app calls
// /api/claude; netlify.toml redirects that to this function, which
// forwards the request to Anthropic and returns the response.

export default async (req) => {
  // Only allow POST
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return new Response(
      JSON.stringify({ error: "Server missing ANTHROPIC_API_KEY" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Bad JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Upstream request failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
};
