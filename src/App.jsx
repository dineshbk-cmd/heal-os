import React, { useState, useEffect, useRef } from "react";

// ─────────────────────────────────────────────────────────────
// H.E.A.L. Daily Operating System — Harmonic Hustlers Hub
// A "doing" tool (not teaching). Four functions mapped to H.E.A.L.:
//   Head     → Belief-to-Reframe Engine
//   Emotion  → State-Shift Button
//   Alignment→ Weekly Outcome Tracker
//   Lifestyle→ Offer / Income Co-pilot
// All AI calls go through the Anthropic Messages API (handled by host).
// ─────────────────────────────────────────────────────────────

const MODEL = "claude-sonnet-4-5";

async function callClaude(system, userText, maxTokens = 1000) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });
  const data = await res.json();
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

async function callClaudeJSON(system, userText, maxTokens = 1200) {
  const raw = await callClaude(
    system + "\n\nRespond with ONLY valid JSON. No markdown, no backticks, no preamble.",
    userText,
    maxTokens
  );
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─────────────────────────────────────────────────────────────
// LEAD CAPTURE + "REMEMBER ME"
//
// 1) LEAD CAPTURE — when someone logs in, their details are POSTed
//    to your Google Apps Script web-app URL, which appends a row to
//    your Google Sheet (same pattern as your student pipeline).
//    >>> PASTE YOUR APPS SCRIPT URL BELOW <<<
//    Until you do, leads are just logged to console (prototype mode).
//
// 2) REMEMBER ME — uses browser localStorage so the person isn't asked
//    to log in again on their next visit (production build).
// ─────────────────────────────────────────────────────────────
const LEAD_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycby5Th-IjPaEx_3Rreroxpp6XaxTzaAyi7Zz9UztpPdNyxXSGskfYxtKNgrUxCNV7g8KyQ/exec"; // e.g. "https://script.google.com/macros/s/AKfy.../exec"
const STORE_KEY = "heal_member";

async function saveLead(member) {
  // send to your sheet (no-cors so it works from any host without errors)
  if (LEAD_WEBHOOK_URL) {
    try {
      await fetch(LEAD_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...member, ts: new Date().toISOString() }),
      });
    } catch (e) { /* swallow — never block the user */ }
  } else {
    console.log("[LEAD captured — add LEAD_WEBHOOK_URL to send to your Sheet]", member);
  }
}

function loadMember() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); }
  catch { return null; }
}
function persistMember(member) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(member)); } catch {}
}
function clearMember() {
  try { localStorage.removeItem(STORE_KEY); } catch {}
}

// ── themed styles via CSS vars ────────────────────────────────
// Two palettes. Default "professional" (deep green + gold, premium/HNWI).
// "student" (warm cream + coral/amber, brighter & higher-energy for the
// college funnel). Toggle in the header; choice persists in localStorage.
const styleTag = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Outfit:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; }

  /* PROFESSIONAL — deep green + gold, dark, premium */
  .heal-root[data-theme="professional"] {
    --bg: #0e1614; --bg2: #131f1c; --card: #18241f; --line: #25352e;
    --gold: #c9a45c; --gold-soft: #e3c98a; --sage: #7fa88f;
    --cream: #ece6d8; --muted: #8a9a91; --rose: #cf8a7a;
    --p-head: #c9a45c; --p-emotion: #cf8a7a; --p-align: #9db8c9; --p-life: #7fa88f;
    background:
      radial-gradient(1200px 600px at 80% -10%, rgba(201,164,92,0.08), transparent 60%),
      radial-gradient(900px 500px at -10% 110%, rgba(127,168,143,0.07), transparent 60%),
      var(--bg);
  }
  /* STUDENT — warm cream + coral/amber, light, energetic */
  .heal-root[data-theme="student"] {
    --bg: #fbf6ee; --bg2: #f4ead9; --card: #ffffff; --line: #ecdcc4;
    --gold: #e8743b; --gold-soft: #f59e4a; --sage: #2f9e7d;
    --cream: #2a2118; --muted: #8a7a66; --rose: #e8743b;
    --p-head: #e8743b; --p-emotion: #d65a8a; --p-align: #3a86c8; --p-life: #2f9e7d;
    background:
      radial-gradient(1000px 500px at 85% -10%, rgba(245,158,74,0.18), transparent 60%),
      radial-gradient(800px 460px at -10% 110%, rgba(47,158,125,0.12), transparent 60%),
      var(--bg);
  }
  .heal-root {
    font-family: 'Outfit', sans-serif; color: var(--cream);
    min-height: 100vh; padding: 0; transition: background .4s ease;
  }
  .heal-display { font-family: 'Fraunces', serif; }
  @keyframes fadeUp { from { opacity:0; transform: translateY(12px);} to {opacity:1; transform:none;} }
  @keyframes pulse { 0%,100%{transform:scale(1);opacity:.9} 50%{transform:scale(1.06);opacity:1} }
  @keyframes breathe { 0%,100%{transform:scale(1)} 50%{transform:scale(1.35)} }
  @keyframes spin { to { transform: rotate(360deg);} }
  .fade { animation: fadeUp .5s ease both; }
  .spin { animation: spin .9s linear infinite; }
`;

const Spinner = () => (
  <span
    className="spin"
    style={{
      width: 16, height: 16, borderRadius: "50%",
      border: "2px solid var(--line)", borderTopColor: "var(--gold)",
      display: "inline-block",
    }}
  />
);

// ── TAB 1 · Belief-to-Reframe Engine ─────────────────────────
function ReframeEngine() {
  const [thought, setThought] = useState("");
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState(null);
  const [err, setErr] = useState("");

  const run = async () => {
    if (!thought.trim()) return;
    setLoading(true); setErr(""); setOut(null);
    try {
      const sys =
        "You are the Reframe Engine inside the H.E.A.L.™ framework by Dinesh BK (Harmonic Hustlers Hub). " +
        "A working professional shares a self-sabotaging or limiting thought. " +
        "Do NOT lecture or teach theory. Give them a usable, in-the-moment rewrite in their own first-person voice. " +
        "Identify the hidden limiting belief, the cognitive trap/distortion, a punchy first-person reframe they can say to themselves, " +
        "the single matching technique (one of: Belief Change, RAS Priming, Identity vs Behavior, Inner Dialogue Correction, Self-Image), " +
        "and one tiny 2-minute action. Keep every field tight and human. " +
        'JSON shape: {"belief":"","trap":"","reframe":"","technique":"","micro_action":""}';
      const j = await callClaudeJSON(sys, `Thought: "${thought}"`);
      setOut(j);
    } catch (e) {
      setErr("Couldn't reach the engine. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade">
      <Lead
        kicker="HEAD"
        title="Belief → Reframe Engine"
        sub="Type the spiralling thought. Get an instant rewrite in your own voice — not a lecture."
      />
      <textarea
        value={thought}
        onChange={(e) => setThought(e.target.value)}
        placeholder="e.g. I'll never be able to charge what I'm worth, people will think I'm a fraud…"
        rows={3}
        style={ta}
      />
      <button style={btn} onClick={run} disabled={loading}>
        {loading ? <><Spinner /> &nbsp;Rewriting…</> : "Rewrite this thought →"}
      </button>
      {err && <p style={errTxt}>{err}</p>}
      {out && (
        <div className="fade" style={{ marginTop: 22, display: "grid", gap: 12 }}>
          <Field label="The belief underneath" v={out.belief} accent="rose" />
          <Field label="The trap you're in" v={out.trap} accent="muted" />
          <Field label="Say this instead" v={out.reframe} accent="gold" big />
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Pill>Technique · {out.technique}</Pill>
            <Pill>2-min action · {out.micro_action}</Pill>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TAB 2 · State-Shift Button ───────────────────────────────
const EMOTIONS = [
  ["Overwhelmed", "🌊"], ["Anxious", "⚡"], ["Stuck", "🪨"],
  ["Angry", "🔥"], ["Low energy", "🌫️"], ["Self-doubt", "🌑"],
];

function StateShift() {
  const [sel, setSel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [proto, setProto] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | breathing
  const [count, setCount] = useState(0);

  const pick = async (emo) => {
    setSel(emo); setLoading(true); setProto(null); setPhase("idle");
    try {
      const sys =
        "You are the State-Shift module of H.E.A.L.™ (Dinesh BK). The user taps an emotion; give a 60-second reset they can DO right now. " +
        "No theory. Use the PFL/M lens — Physiology, Focus, Language/Meaning. " +
        "Give a 4-count breath pattern (inhale, hold, exhale, hold in seconds), one physiology move, one focus question, one meaning reframe, and a one-line mantra. " +
        'JSON: {"breath":{"inhale":4,"hold1":4,"exhale":4,"hold2":2},"physiology":"","focus_question":"","meaning":"","mantra":""}';
      const j = await callClaudeJSON(sys, `Emotion: ${emo}`);
      setProto(j);
    } catch (e) {
      setProto({ error: true });
    } finally {
      setLoading(false);
    }
  };

  // breathing animation driver
  const timer = useRef(null);
  const startBreath = () => {
    setPhase("breathing"); setCount(0);
    let c = 0;
    timer.current = setInterval(() => {
      c += 1; setCount(c);
      if (c >= 4) { clearInterval(timer.current); }
    }, (sumBreath(proto.breath)) * 250);
  };
  useEffect(() => () => clearInterval(timer.current), []);
  const sumBreath = (b) => (b.inhale + b.hold1 + b.exhale + b.hold2);

  return (
    <div className="fade">
      <Lead
        kicker="EMOTION"
        title="State-Shift Button"
        sub="One tap → a 60-second protocol to change your state. Physiology · Focus · Meaning."
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        {EMOTIONS.map(([name, ic]) => (
          <button
            key={name}
            onClick={() => pick(name)}
            style={{
              ...emoBtn,
              borderColor: sel === name ? "var(--gold)" : "var(--line)",
              background: sel === name ? "rgba(201,164,92,0.12)" : "var(--card)",
            }}
          >
            <span style={{ fontSize: 22 }}>{ic}</span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>{name}</span>
          </button>
        ))}
      </div>

      {loading && <p style={{ ...errTxt, color: "var(--muted)" }}><Spinner /> &nbsp;Tuning your reset…</p>}

      {proto && !proto.error && (
        <div className="fade" style={{ marginTop: 20 }}>
          <div style={{ textAlign: "center", padding: "18px 0" }}>
            <div
              style={{
                width: 120, height: 120, margin: "0 auto",
                borderRadius: "50%",
                background: "radial-gradient(circle, var(--gold-soft), var(--gold))",
                animation: phase === "breathing" ? `breathe ${sumBreath(proto.breath)}s ease-in-out infinite` : "pulse 3s ease-in-out infinite",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#0e1614", fontWeight: 600, fontSize: 13, fontFamily: "Outfit",
              }}
            >
              {phase === "breathing" ? `Round ${Math.min(count + 1, 4)}/4` : "Ready"}
            </div>
            <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 12 }}>
              Breathe · in {proto.breath.inhale}s — hold {proto.breath.hold1}s — out {proto.breath.exhale}s — hold {proto.breath.hold2}s
            </p>
            {phase === "idle" && (
              <button style={{ ...btn, marginTop: 6, width: "auto", padding: "10px 22px" }} onClick={startBreath}>
                Start breathing
              </button>
            )}
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Physiology — do this" v={proto.physiology} accent="sage" />
            <Field label="Focus — ask yourself" v={proto.focus_question} accent="gold" />
            <Field label="Meaning — the reframe" v={proto.meaning} accent="muted" />
            <Field label="Mantra" v={proto.mantra} accent="gold" big />
          </div>
        </div>
      )}
      {proto && proto.error && <p style={errTxt}>Couldn't load the protocol. Tap again.</p>}
    </div>
  );
}

// ── TAB 3 · Weekly Outcome Tracker ───────────────────────────
const WEEKS = [
  "W1 · Rewire the Operator", "W2 · Set the Target", "W3 · End the Productivity Scam",
  "W4 · Inner Operating System", "W5 · Command the Room", "W6 · Energy & Clarity",
  "W7 · Build Your Second Engine", "W8 · The Freedom Architect",
];

function Tracker() {
  const [week, setWeek] = useState(WEEKS[0]);
  const [m, setM] = useState({ clarity: 5, calm: 5, hours: 0, win: "" });
  const [loading, setLoading] = useState(false);
  const [coach, setCoach] = useState(null);

  const submit = async () => {
    setLoading(true); setCoach(null);
    try {
      const sys =
        "You are the Outcome Tracker coach in H.E.A.L.™ (Dinesh BK). The user logs weekly self-ratings. " +
        "Be warm, specific, and brief. Acknowledge the progress signal in the numbers, name the ONE thing to do next, and give a single encouraging line. No fluff, no lecture. " +
        'JSON: {"read":"", "next_action":"", "encouragement":""}';
      const j = await callClaudeJSON(
        sys,
        `Week: ${week}. Clarity ${m.clarity}/10. Calm ${m.calm}/10. Hours on the one priority this week: ${m.hours}. Their win: "${m.win || "none logged"}".`
      );
      setCoach(j);
    } catch (e) {
      setCoach({ error: true });
    } finally {
      setLoading(false);
    }
  };

  const Slider = ({ label, k }) => (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)" }}>
        <span>{label}</span><span style={{ color: "var(--gold)" }}>{m[k]}/10</span>
      </div>
      <input type="range" min={1} max={10} value={m[k]}
        onChange={(e) => setM({ ...m, [k]: +e.target.value })}
        style={{ width: "100%", accentColor: "var(--gold)" }} />
    </div>
  );

  return (
    <div className="fade">
      <Lead
        kicker="ALIGNMENT"
        title="Weekly Outcome Tracker"
        sub="Log the markers. The AI reads your trend and hands you the single next action."
      />
      <label style={lbl}>This week</label>
      <select value={week} onChange={(e) => setWeek(e.target.value)} style={{ ...ta, padding: 12, height: 46 }}>
        {WEEKS.map((w) => <option key={w}>{w}</option>)}
      </select>
      <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
        <Slider label="Clarity" k="clarity" />
        <Slider label="Calm (low cortisol)" k="calm" />
        <div>
          <label style={lbl}>Hours on your ONE priority this week</label>
          <input type="number" min={0} value={m.hours}
            onChange={(e) => setM({ ...m, hours: +e.target.value })} style={{ ...ta, height: 44 }} />
        </div>
        <div>
          <label style={lbl}>One win / action you took</label>
          <input value={m.win} onChange={(e) => setM({ ...m, win: e.target.value })}
            placeholder="e.g. sent the offer to 1 prospect" style={{ ...ta, height: 44 }} />
        </div>
      </div>
      <button style={btn} onClick={submit} disabled={loading}>
        {loading ? <><Spinner /> &nbsp;Reading your week…</> : "Log & get my next action →"}
      </button>
      {coach && !coach.error && (
        <div className="fade" style={{ marginTop: 20, display: "grid", gap: 12 }}>
          <Field label="What your week says" v={coach.read} accent="sage" />
          <Field label="Your single next action" v={coach.next_action} accent="gold" big />
          <Field label="" v={coach.encouragement} accent="muted" />
        </div>
      )}
      {coach && coach.error && <p style={errTxt}>Couldn't log this. Try again.</p>}
    </div>
  );
}

// ── TAB 4 · Offer / Income Co-pilot (guided, multi-question) ──
// Questions modelled on how top coaches qualify a high-converting
// offer: dream outcome, who/pain, proof, mechanism, time-to-result,
// risk-reversal, price posture (Hormozi value-equation lineage).
const OFFER_QS = [
  { k: "expertise", label: "What do you know or do well?",
    ph: "e.g. 12 yrs in supply-chain ops; I fix vendor delays fast", type: "area" },
  { k: "audience", label: "Who exactly has this problem & can pay?",
    ph: "e.g. SME manufacturers in Chennai doing ₹5–50 Cr", type: "text" },
  { k: "pain", label: "What painful problem do they lie awake over?",
    ph: "e.g. late shipments killing their client relationships", type: "area" },
  { k: "dream", label: "What's the dream result they want?",
    ph: "e.g. on-time delivery every month, no firefighting", type: "text" },
  { k: "proof", label: "What proof / result have you created before?",
    ph: "e.g. cut a plant's delays 40% in 3 months", type: "area" },
  { k: "mechanism", label: "Your unique method or 'unfair advantage'?",
    ph: "e.g. a 5-step vendor scorecard nobody else uses", type: "text" },
  { k: "speed", label: "How fast can they see a first result?",
    ph: "e.g. first quick win in 2 weeks", type: "text" },
];

function OfferCopilot() {
  const [step, setStep] = useState(0);
  const [a, setA] = useState({});
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState(null);

  const q = OFFER_QS[step];
  const isLast = step === OFFER_QS.length - 1;
  const canNext = (a[q?.k] || "").trim().length > 0;

  const build = async () => {
    setLoading(true); setOut(null);
    try {
      const sys =
        "You are the Offer/Income Co-pilot in H.E.A.L.™ (Dinesh BK, Harmonic Hustlers Hub), Weeks 7-8 (second income / consulting). " +
        "You design high-converting, productized offers the way top coaches do — using the value-equation logic: maximise dream outcome and perceived likelihood of success, minimise time delay and effort/sacrifice. " +
        "Be concrete, India-context aware (INR), and make it launchable this week. " +
        "Return: a magnetic offer name; a one-sentence Grand-Slam promise (specific result + timeframe); the 'who it's for'; 3-5 deliverables; the named mechanism/framework; a risk-reversal or guarantee; a suggested price band with brief rationale; 3 fast-action bonuses; and a ready-to-send outreach message. " +
        'JSON: {"offer_name":"","promise":"","who":"","deliverables":["",""],"mechanism":"","guarantee":"","price_band":"","price_rationale":"","bonuses":["","",""],"outreach":""}';
      const u = OFFER_QS.map((x) => `${x.label} -> ${a[x.k] || "(blank)"}`).join("\n");
      const j = await callClaudeJSON(sys, u, 1800);
      setOut(j);
    } catch (e) {
      setOut({ error: true });
    } finally {
      setLoading(false);
    }
  };

  if (out) {
    return (
      <div className="fade">
        <Lead kicker="LIFESTYLE" title="Your Grand-Slam Offer" sub="Built from your answers. Tweak, price, and send today." />
        {out.error ? (
          <p style={errTxt}>Couldn't build the offer. <button style={copyBtn} onClick={build}>Retry</button></p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Offer name" v={out.offer_name} accent="gold" big />
            <Field label="The promise" v={out.promise} accent="sage" />
            <Field label="Who it's for" v={out.who} accent="muted" />
            <ListCard label="What they get" items={out.deliverables} />
            <Field label="Your mechanism" v={out.mechanism} accent="gold" />
            <Field label="Risk reversal / guarantee" v={out.guarantee} accent="sage" />
            <div style={card}>
              <div style={fieldLbl}>Price band</div>
              <div style={{ marginTop: 6, fontFamily: "Fraunces, serif", fontSize: 18, color: "var(--gold-soft)" }}>{out.price_band}</div>
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{out.price_rationale}</div>
            </div>
            <ListCard label="Fast-action bonuses" items={out.bonuses} />
            <div style={card}>
              <div style={{ ...fieldLbl, display: "flex", justifyContent: "space-between" }}>
                <span>Send this today</span>
                <button style={copyBtn} onClick={() => navigator.clipboard?.writeText(out.outreach)}>Copy</button>
              </div>
              <p style={{ margin: "8px 0 0", color: "var(--cream)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{out.outreach}</p>
            </div>
            <button style={{ ...btn, background: "var(--card)", color: "var(--gold-soft)", border: "1px solid var(--line)" }}
              onClick={() => { setOut(null); setStep(0); }}>↺ Start a new offer</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fade">
      <Lead kicker="LIFESTYLE" title="Offer / Income Co-pilot"
        sub="A few sharp questions — then a complete, launchable offer." />
      {/* progress */}
      <div style={{ display: "flex", gap: 5, marginBottom: 18 }}>
        {OFFER_QS.map((_, i) => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 99,
            background: i <= step ? "var(--gold)" : "var(--line)", transition: "background .3s",
          }} />
        ))}
      </div>
      <div key={step} className="fade">
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Question {step + 1} of {OFFER_QS.length}</div>
        <label style={{ ...lbl, fontSize: 18, color: "var(--cream)", fontFamily: "Fraunces, serif", marginTop: 8 }}>{q.label}</label>
        {q.type === "area" ? (
          <textarea autoFocus value={a[q.k] || ""} rows={3}
            onChange={(e) => setA({ ...a, [q.k]: e.target.value })} placeholder={q.ph} style={ta} />
        ) : (
          <input autoFocus value={a[q.k] || ""}
            onChange={(e) => setA({ ...a, [q.k]: e.target.value })} placeholder={q.ph} style={{ ...ta, height: 46 }} />
        )}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        {step > 0 && (
          <button style={{ ...btn, marginTop: 0, flex: "0 0 auto", width: "auto", padding: "13px 18px", background: "var(--card)", color: "var(--gold-soft)", border: "1px solid var(--line)" }}
            onClick={() => setStep(step - 1)}>← Back</button>
        )}
        {!isLast ? (
          <button style={{ ...btn, marginTop: 0, opacity: canNext ? 1 : 0.5 }} disabled={!canNext}
            onClick={() => setStep(step + 1)}>Next →</button>
        ) : (
          <button style={{ ...btn, marginTop: 0, opacity: canNext ? 1 : 0.5 }} disabled={!canNext || loading}
            onClick={build}>{loading ? <><Spinner /> &nbsp;Building…</> : "Build my offer ✦"}</button>
        )}
      </div>
    </div>
  );
}

function ListCard({ label, items }) {
  return (
    <div style={card}>
      <div style={fieldLbl}>{label}</div>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18, color: "var(--cream)", lineHeight: 1.6 }}>
        {(items || []).map((d, i) => <li key={i}>{d}</li>)}
      </ul>
    </div>
  );
}

// ── TAB 5 · Harmonic Life Wheel (Gap Map) ────────────────────
// 8 areas, each mapped to a H.E.A.L. dimension. User sets where they
// are NOW vs where they WANT to be (0-10). The gap is shown visually
// and the AI names the ONE gap to close first + a first step.
const LIFE_AREAS = [
  { name: "Mind & Beliefs", heal: "Head", color: "var(--p-head)" },
  { name: "Emotions & Calm", heal: "Emotion", color: "var(--p-emotion)" },
  { name: "Health & Energy", heal: "Lifestyle", color: "var(--p-life)" },
  { name: "Career & Mission", heal: "Alignment", color: "var(--p-align)" },
  { name: "Money & Wealth", heal: "Lifestyle", color: "var(--p-life)" },
  { name: "Relationships", heal: "Emotion", color: "var(--p-emotion)" },
  { name: "Time & Freedom", heal: "Alignment", color: "var(--p-align)" },
  { name: "Growth & Spirit", heal: "Head", color: "var(--p-life)" },
];

function polar(cx, cy, r, angleDeg) {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function wedgePath(cx, cy, r, i, n) {
  const step = 360 / n;
  const [x1, y1] = polar(cx, cy, r, i * step);
  const [x2, y2] = polar(cx, cy, r, (i + 1) * step);
  return `M${cx},${cy} L${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2} Z`;
}

function LifeWheel() {
  const [now, setNow] = useState(LIFE_AREAS.map(() => 5));
  const [want, setWant] = useState(LIFE_AREAS.map(() => 9));
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState(null);

  const CX = 150, CY = 150, RMAX = 130;
  const n = LIFE_AREAS.length;

  const analyze = async () => {
    setLoading(true); setOut(null);
    try {
      const sys =
        "You are the Harmonic Life Wheel coach in H.E.A.L.™ (Dinesh BK). The user rated 8 life areas: where they are now vs where they want to be (0-10). " +
        "Find the gaps (want - now). Don't just pick the biggest number — weigh which gap, if closed, would lift the others most (the keystone area). " +
        "Be warm and brief, no lecture. Map your advice to the H.E.A.L. dimension of that area. " +
        'JSON: {"keystone_area":"","why":"","first_step":"","ripple":"","one_line":""}';
      const data = LIFE_AREAS.map((ar, i) => `${ar.name} (${ar.heal}): now ${now[i]}, want ${want[i]}, gap ${want[i] - now[i]}`).join("\n");
      const j = await callClaudeJSON(sys, data, 900);
      setOut(j);
    } catch (e) { setOut({ error: true }); }
    finally { setLoading(false); }
  };

  const A = LIFE_AREAS[active];

  return (
    <div className="fade">
      <Lead kicker="THE MAP" title="Harmonic Life Wheel"
        sub="Rate where you are vs where you want to be. See the gap — then close the one that matters most." />

      {/* WHEEL */}
      <div style={{ display: "flex", justifyContent: "center", margin: "4px 0 10px" }}>
        <svg viewBox="0 0 300 300" style={{ width: "100%", maxWidth: 320 }}>
          {/* grid rings */}
          {[0.25, 0.5, 0.75, 1].map((f, i) => (
            <circle key={i} cx={CX} cy={CY} r={RMAX * f} fill="none" stroke="var(--line)" strokeWidth="1" />
          ))}
          {/* desired (outline) wedges */}
          {LIFE_AREAS.map((ar, i) => (
            <path key={"w" + i} d={wedgePath(CX, CY, (want[i] / 10) * RMAX, i, n)}
              fill="none" stroke={ar.color} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.7" />
          ))}
          {/* current (filled) wedges */}
          {LIFE_AREAS.map((ar, i) => (
            <path key={"n" + i} d={wedgePath(CX, CY, (now[i] / 10) * RMAX, i, n)}
              fill={ar.color} opacity={active === i ? 0.85 : 0.5}
              stroke="var(--bg)" strokeWidth="1.5" style={{ cursor: "pointer", transition: "opacity .2s" }}
              onClick={() => setActive(i)} />
          ))}
          {/* labels */}
          {LIFE_AREAS.map((ar, i) => {
            const [lx, ly] = polar(CX, CY, RMAX + 14, i * (360 / n) + 360 / n / 2);
            return (
              <text key={"t" + i} x={lx} y={ly} fontSize="8.5" fill={active === i ? "var(--cream)" : "var(--muted)"}
                textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: "Outfit", cursor: "pointer", fontWeight: active === i ? 600 : 400 }}
                onClick={() => setActive(i)}>
                {ar.name.split(" & ").map((p, k) => <tspan key={k} x={lx} dy={k === 0 ? 0 : 9}>{p}</tspan>)}
              </text>
            );
          })}
        </svg>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 18, fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>
        <span>● Filled = today</span><span>┄ Dashed = desired</span>
      </div>

      {/* per-area sliders */}
      <div style={{ ...card, borderColor: A.color }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="heal-display" style={{ fontSize: 18, color: "var(--cream)" }}>{A.name}</span>
          <Pill>{A.heal}</Pill>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)" }}>
            <span>Where I am now</span><span style={{ color: A.color }}>{now[active]}/10</span>
          </div>
          <input type="range" min={0} max={10} value={now[active]}
            onChange={(e) => { const c = [...now]; c[active] = +e.target.value; setNow(c); }}
            style={{ width: "100%", accentColor: A.color }} />
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted)" }}>
            <span>Where I want to be</span><span style={{ color: "var(--gold-soft)" }}>{want[active]}/10</span>
          </div>
          <input type="range" min={0} max={10} value={want[active]}
            onChange={(e) => { const c = [...want]; c[active] = +e.target.value; setWant(c); }}
            style={{ width: "100%", accentColor: "var(--gold-soft)" }} />
        </div>
        <div style={{ marginTop: 10, textAlign: "center", fontSize: 13, color: "var(--muted)" }}>
          Gap: <span style={{ color: "var(--rose)", fontWeight: 600 }}>{Math.max(0, want[active] - now[active])} points</span>
        </div>
      </div>

      {/* area dots */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12, justifyContent: "center" }}>
        {LIFE_AREAS.map((ar, i) => (
          <button key={i} onClick={() => setActive(i)} style={{
            fontSize: 11, padding: "5px 10px", borderRadius: 99, cursor: "pointer", fontFamily: "Outfit",
            border: `1px solid ${active === i ? ar.color : "var(--line)"}`,
            background: active === i ? "rgba(201,164,92,0.1)" : "transparent",
            color: active === i ? "var(--cream)" : "var(--muted)",
          }}>{ar.name}</button>
        ))}
      </div>

      <button style={btn} onClick={analyze} disabled={loading}>
        {loading ? <><Spinner /> &nbsp;Reading your wheel…</> : "Find my keystone gap →"}
      </button>

      {out && !out.error && (
        <div className="fade" style={{ marginTop: 18, display: "grid", gap: 12 }}>
          <Field label="Close this gap first" v={out.keystone_area} accent="gold" big />
          <Field label="Why this one" v={out.why} accent="sage" />
          <Field label="Your first step" v={out.first_step} accent="gold" />
          <Field label="The ripple effect" v={out.ripple} accent="muted" />
          <Field label="" v={out.one_line} accent="rose" />
        </div>
      )}
      {out && out.error && <p style={errTxt}>Couldn't read the wheel. Try again.</p>}
    </div>
  );
}

// ── TAB 6 · Millionaire Mindset Baseline (no AI; works anywhere) ─
// Verbatim 50 statements + scoring from Sidharth Shah / Think and
// Grow Rich Academy, mapped onto H.E.A.L. pillars (Dinesh's mapping).
const MM_STATEMENTS = [
  "I know there is power beyond myself from which I can draw strength",
  "I am committed to living my life to high standards and a higher purpose",
  "I don't let my mistakes discourage me",
  "I allow people time to reach their own solution",
  "I have the quality of being able to stick to plans and projects",
  "I see individual events as part of a greater plan",
  "I don't let danger or crises paralyze me",
  "I keep control over my emotions",
  "I tell the truth",
  "I don't let doubt affect my pursuit of a worthy goal",
  "I rise to the occasion when goals seem out of reach",
  "I keep my eye on my goals, even through daily distractions",
  "I speak up on behalf of unpopular positions if I think they have merit",
  "I use the same standard of measuring my own behavior as the behavior of others",
  "I make a conscious effort to react evenly",
  "I wake up feeling excited about the day ahead",
  "I react to stress with self-control",
  "I thrive on finding needs that interest me and fulfilling them",
  "I stay in touch with my goals",
  "I take on assignments that interest me even when the odds of a favorable outcome are slim",
  "I meet challenges with a sense of control",
  "I stay on course even when things get uncertain",
  "I make sure fear and feelings of inferiority don't drive my actions",
  "I don't allow anxiety over an outcome to rattle my composure",
  "I concentrate my energy where it will do the most good",
  "I am able to control my worries and resentments",
  "I summon up the energy needed to see a job through",
  "I act with a sense of hope about what lies ahead",
  "I contribute to the group's morale even under difficult circumstances",
  "I practice affirming myself in my skills and my outlook",
  "I show energy about projects that excite others",
  "I create a mental plan to get a task done",
  "I move forward decisively",
  "I have a clear picture of where I want to be in my life",
  "I don't obsess over an issue",
  "I work to minimize the impact of my doubts and fears",
  "I don't act or speak hastily without considering the consequences",
  "I don't cop out hoping others will get the job done",
  "I avoid gossiping about others",
  "I gear myself to be positively hopeful in my attitudes and expectations",
  "I keep my spirits up even when things aren't going well",
  "I don't allow worry to get the best of me",
  "I am not from the \u201Clet's just be done with it\u201D school of fast solutions",
  "I am energetic in pursuing outcomes",
  "I engage in those activities that are necessary to meet my goals",
  "I get a kick out of life",
  "I treat people evenhandedly and fairly",
  "I do not allow my fears to set my goals",
  "I don't engage in playing off one person against another",
  "I don't panic when adversity occurs",
];
const MM_TRAITS = [
  { name: "Optimism", items: [21, 28, 36, 40, 41], pillar: "Lifestyle", desc: "belief in positive outcomes" },
  { name: "Enthusiasm", items: [16, 18, 31, 44, 46], pillar: "Lifestyle", desc: "energy, passion, drive" },
  { name: "Belief", items: [1, 2, 6, 30, 42], pillar: "Head", desc: "trust in self & a higher purpose" },
  { name: "Integrity", items: [9, 14, 39, 47, 49], pillar: "Alignment", desc: "honesty, fairness, standards" },
  { name: "Courage", items: [7, 13, 20, 22, 29], pillar: "Emotion", desc: "taking risks, facing fear" },
  { name: "Confidence", items: [3, 10, 17, 23, 33], pillar: "Alignment", desc: "assurance in your abilities" },
  { name: "Determination", items: [5, 11, 27, 32, 38], pillar: "Head", desc: "tireless pursuit of a goal" },
  { name: "Patience", items: [4, 15, 24, 37, 43], pillar: "Emotion", desc: "willingness to wait & reflect" },
  { name: "Calmness", items: [8, 26, 35, 48, 50], pillar: "Emotion", desc: "serenity & balance under pressure" },
  { name: "Focus", items: [12, 19, 25, 34, 45], pillar: "Head", desc: "attention set by goals & priorities" },
];
const PILLAR_COLOR = { Head: "var(--p-head)", Emotion: "var(--p-emotion)", Alignment: "var(--p-align)", Lifestyle: "var(--p-life)" };

function Assessment() {
  const [scores, setScores] = useState({}); // {itemNumber: 0-5}
  const [done, setDone] = useState(false);
  const answered = Object.keys(scores).length;
  const allDone = answered === 50;

  const compute = () => {
    return MM_TRAITS.map((t) => {
      const total = t.items.reduce((s, n) => s + (scores[n] || 0), 0);
      const low = t.items.filter((n) => (scores[n] || 0) < 3);
      return { ...t, total, high: total >= 20, lowItems: low };
    });
  };
  const pillarTotals = () => {
    const r = { Head: 0, Emotion: 0, Alignment: 0, Lifestyle: 0 };
    compute().forEach((t) => (r[t.pillar] += t.total));
    return r;
  };

  if (done) {
    const traits = compute();
    const grand = traits.reduce((s, t) => s + t.total, 0);
    const pt = pillarTotals();
    return (
      <div className="fade">
        <Lead kicker="YOUR BASELINE" title="Millionaire Mindset Profile"
          sub={`Total ${grand}/250 · re-take at Day 30 and watch the number move.`} />
        {/* H.E.A.L. pillar summary */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 16 }}>
          {Object.entries(pt).map(([p, v]) => (
            <div key={p} style={{ ...card, borderColor: PILLAR_COLOR[p], padding: 12 }}>
              <div style={{ fontSize: 11, letterSpacing: 1, color: "var(--muted)" }}>{p.toUpperCase()}</div>
              <div className="heal-display" style={{ fontSize: 22, color: PILLAR_COLOR[p] }}>{v}</div>
            </div>
          ))}
        </div>
        {/* per-trait bars */}
        <div style={{ display: "grid", gap: 10 }}>
          {traits.map((t) => (
            <div key={t.name} style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontWeight: 600, color: "var(--cream)" }}>{t.name}
                  <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>{t.desc}</span>
                </span>
                <span style={{ fontFamily: "Fraunces, serif", fontSize: 18, color: t.high ? "var(--sage)" : "var(--rose)" }}>
                  {t.total}/25
                </span>
              </div>
              <div style={{ height: 7, background: "var(--bg2)", borderRadius: 99, marginTop: 8, overflow: "hidden" }}>
                <div style={{ width: `${(t.total / 25) * 100}%`, height: "100%", background: PILLAR_COLOR[t.pillar], transition: "width .6s" }} />
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
                {t.pillar} · {t.high ? "High-scoring (20+)" : "Worth investigating (below 19)"}
                {t.lowItems.length > 0 && ` · re-read items: ${t.lowItems.join(", ")}`}
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic", marginTop: 14, lineHeight: 1.5 }}>
          A trait of 20+ is high; any single item under 3 is worth a closer look. Large swings within one
          trait (a 5 next to a 1) reveal where belief and action don't yet match. Assessment by Sidharth Shah,
          Think and Grow Rich Academy; H.E.A.L.™ mapping by Harmonic Hustlers Hub.
        </p>
        <button style={{ ...btn, background: "var(--card)", color: "var(--gold-soft)", border: "1px solid var(--line)" }}
          onClick={() => { setDone(false); }}>↺ Review my answers</button>
      </div>
    );
  }

  return (
    <div className="fade">
      <Lead kicker="THE MIRROR" title="Millionaire Mindset Baseline"
        sub="Rate each statement 0–5 on how often it's true for you. First instinct — don't overthink." />
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
        <span>5 = almost always · 0 = not sure</span>
        <span style={{ color: "var(--gold)" }}>{answered}/50</span>
      </div>
      <div style={{ height: 5, background: "var(--bg2)", borderRadius: 99, marginBottom: 16, overflow: "hidden" }}>
        <div style={{ width: `${(answered / 50) * 100}%`, height: "100%", background: "var(--gold)", transition: "width .3s" }} />
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {MM_STATEMENTS.map((s, idx) => {
          const num = idx + 1;
          return (
            <div key={num} style={{ ...card, padding: 14 }}>
              <div style={{ fontSize: 14, color: "var(--cream)", marginBottom: 10 }}>
                <span style={{ color: "var(--muted)" }}>{num}.</span> {s}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 5 }}>
                {[0, 1, 2, 3, 4, 5].map((v) => (
                  <button key={v} onClick={() => setScores({ ...scores, [num]: v })}
                    style={{
                      padding: "8px 0", borderRadius: 8, cursor: "pointer", fontFamily: "Outfit", fontSize: 14,
                      border: `1px solid ${scores[num] === v ? "var(--gold)" : "var(--line)"}`,
                      background: scores[num] === v ? "var(--gold)" : "transparent",
                      color: scores[num] === v ? "#0e1614" : "var(--muted)", fontWeight: scores[num] === v ? 600 : 400,
                    }}>{v}</button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <button style={{ ...btn, opacity: allDone ? 1 : 0.55 }} disabled={!allDone}
        onClick={() => setDone(true)}>
        {allDone ? "See my profile →" : `Answer all 50 (${50 - answered} left)`}
      </button>
    </div>
  );
}

// ── shared little components ──────────────────────────────────
function Lead({ kicker, title, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <span style={{ letterSpacing: 3, fontSize: 11, color: "var(--gold)", fontWeight: 600 }}>{kicker}</span>
      <h2 className="heal-display" style={{ margin: "6px 0 6px", fontSize: 26, color: "var(--cream)", fontWeight: 500 }}>{title}</h2>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>{sub}</p>
    </div>
  );
}
function Field({ label, v, accent = "muted", big }) {
  const colors = { gold: "var(--gold-soft)", sage: "var(--sage)", rose: "var(--rose)", muted: "var(--cream)" };
  return (
    <div style={card}>
      {label && <div style={fieldLbl}>{label}</div>}
      <div style={{
        marginTop: label ? 6 : 0, color: colors[accent], lineHeight: 1.55,
        fontSize: big ? 18 : 15, fontFamily: big ? "Fraunces, serif" : "Outfit",
        fontWeight: big ? 500 : 400,
      }}>{v}</div>
    </div>
  );
}
const Pill = ({ children }) => (
  <span style={{
    background: "rgba(201,164,92,0.1)", border: "1px solid var(--line)",
    color: "var(--gold-soft)", padding: "8px 14px", borderRadius: 999, fontSize: 13,
  }}>{children}</span>
);

// ── styles ────────────────────────────────────────────────────
const ta = {
  width: "100%", background: "var(--bg2)", border: "1px solid var(--line)",
  borderRadius: 12, color: "var(--cream)", padding: 14, fontSize: 15,
  fontFamily: "Outfit", outline: "none", resize: "vertical", marginTop: 6,
};
const lbl = { display: "block", fontSize: 13, color: "var(--muted)", marginTop: 14, marginBottom: 0 };
const btn = {
  marginTop: 16, width: "100%", padding: "13px 18px", borderRadius: 12,
  border: "none", background: "linear-gradient(135deg, var(--gold-soft), var(--gold))",
  color: "#0e1614", fontWeight: 600, fontSize: 15, cursor: "pointer",
  fontFamily: "Outfit", display: "flex", alignItems: "center", justifyContent: "center",
};
const card = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: 16 };
const fieldLbl = { fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "var(--muted)" };
const errTxt = { color: "var(--rose)", fontSize: 14, marginTop: 14 };
const emoBtn = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
  padding: "16px 8px", borderRadius: 14, border: "1px solid var(--line)",
  background: "var(--card)", cursor: "pointer", transition: "all .2s",
};
const copyBtn = {
  background: "transparent", border: "1px solid var(--line)", color: "var(--gold-soft)",
  borderRadius: 8, padding: "3px 10px", fontSize: 12, cursor: "pointer", fontFamily: "Outfit",
};

// TABS: [letter, name, Component, previewTitle, previewBullets[]]
const TABS = [
  ["Head", "Reframe", ReframeEngine,
    "Catch the thought, flip it in seconds",
    ["Type any spiralling thought", "Get the belief & trap underneath it", "A line to say instead + a 2-min action"]],
  ["Emotion", "State-Shift", StateShift,
    "Change your state in 60 seconds",
    ["Tap how you feel right now", "Guided breath + physiology reset", "A focus question, reframe & mantra"]],
  ["Alignment", "Tracker", Tracker,
    "Turn effort into visible progress",
    ["Log clarity, calm & hours weekly", "See your momentum build", "Get your ONE next action each week"]],
  ["Lifestyle", "Offer", OfferCopilot,
    "Build a second income offer",
    ["Answer 7 sharp questions", "Get a complete Grand-Slam offer", "Price, bonuses & a message to send today"]],
  ["Wheel", "Life Map", LifeWheel,
    "See the gap, close the right one",
    ["Rate 8 life areas: now vs desired", "Your gaps drawn as a live wheel", "Find the keystone gap to fix first"]],
  ["Baseline", "Mindset", Assessment,
    "Score your millionaire mindset",
    ["Rate 50 statements, 0–5", "Auto-scores 10 success traits", "Mapped to your H.E.A.L. pillars + benchmarks"]],
];

// ── Tab preview (shown before login) ─────────────────────────
function TabPreview({ data, onUnlock }) {
  const [, name, , pTitle, bullets] = data;
  return (
    <div className="fade" style={{ position: "relative" }}>
      <Lead kicker={`PREVIEW · ${name.toUpperCase()}`} title={pTitle}
        sub="Here's what this tool does once you're in." />
      <div style={{ display: "grid", gap: 10 }}>
        {bullets.map((b, i) => (
          <div key={i} style={{ ...card, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{
              width: 26, height: 26, flex: "0 0 26px", borderRadius: "50%",
              background: "rgba(201,164,92,0.15)", color: "var(--gold-soft)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600,
            }}>{i + 1}</span>
            <span style={{ color: "var(--cream)", fontSize: 15 }}>{b}</span>
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 16, padding: 18, borderRadius: 14, textAlign: "center",
        border: "1px dashed var(--gold)", background: "rgba(201,164,92,0.06)",
      }}>
        <div style={{ fontSize: 22, marginBottom: 6 }}>🔒</div>
        <p style={{ margin: "0 0 12px", color: "var(--muted)", fontSize: 14 }}>
          Free to use — just tell us where to send your access.
        </p>
        <button style={{ ...btn, marginTop: 0 }} onClick={onUnlock}>Unlock all 5 tools — free →</button>
      </div>
    </div>
  );
}

// ── Login modal ──────────────────────────────────────────────
function LoginGate({ onClose, onDone }) {
  const [f, setF] = useState({ name: "", email: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const valid =
    f.name.trim().length > 1 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim()) &&
    f.phone.replace(/\D/g, "").length >= 10;

  const submit = async () => {
    if (!valid) { setErr("Please enter a valid name, email and 10-digit phone."); return; }
    setBusy(true); setErr("");
    const member = { name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() };
    await saveLead(member);   // → your Google Sheet
    persistMember(member);    // remember on next visit
    setBusy(false);
    onDone(member);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(8,12,11,0.78)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 18, zIndex: 50,
    }} onClick={onClose}>
      <div className="fade" style={{ ...card, maxWidth: 400, width: "100%", padding: 26 }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "var(--sage)" }}>HARMONIC HUSTLERS HUB</div>
          <h2 className="heal-display" style={{ fontSize: 24, margin: "8px 0 4px", color: "var(--cream)" }}>
            Get your free access
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
            Unlocks all five H.E.A.L. tools. No spam.
          </p>
        </div>
        <label style={lbl}>Your name</label>
        <input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })}
          placeholder="Full name" style={{ ...ta, height: 46 }} />
        <label style={lbl}>Email</label>
        <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })}
          placeholder="you@email.com" style={{ ...ta, height: 46 }} />
        <label style={lbl}>Mobile number</label>
        <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })}
          placeholder="+91 …" style={{ ...ta, height: 46 }} />
        {err && <p style={{ ...errTxt, marginTop: 10 }}>{err}</p>}
        <button style={{ ...btn, opacity: valid ? 1 : 0.55 }} disabled={busy} onClick={submit}>
          {busy ? <><Spinner /> &nbsp;Unlocking…</> : "Enter →"}
        </button>
        <p style={{ margin: "12px 0 0", fontSize: 11, color: "var(--muted)", textAlign: "center", lineHeight: 1.5 }}>
          By entering you agree to receive program updates from Harmonic Hustlers Hub.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState(0);
  const [member, setMember] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [booted, setBooted] = useState(false);
  const [theme, setTheme] = useState("professional");

  // remember-me + theme: load on first render
  useEffect(() => {
    setMember(loadMember());
    try { setTheme(localStorage.getItem("heal_theme") || "professional"); } catch {}
    setBooted(true);
  }, []);
  const toggleTheme = () => {
    const next = theme === "professional" ? "student" : "professional";
    setTheme(next);
    try { localStorage.setItem("heal_theme", next); } catch {}
  };

  const active = TABS[tab];
  const Active = active[2];

  return (
    <div className="heal-root" data-theme={theme}>
      <style>{styleTag}</style>
      {showLogin && (
        <LoginGate
          onClose={() => setShowLogin(false)}
          onDone={(m) => { setMember(m); setShowLogin(false); }}
        />
      )}
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "28px 18px 60px" }}>
        <header style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 11, letterSpacing: 4, color: "var(--sage)" }}>HARMONIC HUSTLERS HUB</div>
          <h1 className="heal-display" style={{ fontSize: 30, margin: "8px 0 2px", fontWeight: 600, color: "var(--cream)" }}>
            H.E.A.L. Daily OS
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
            Head · Emotion · Alignment · Lifestyle — a tool to <em>do</em>, not study.
          </p>
          <button onClick={toggleTheme} title="Switch theme"
            style={{
              marginTop: 10, fontSize: 11, padding: "5px 12px", borderRadius: 99,
              border: "1px solid var(--line)", background: "var(--card)",
              color: "var(--muted)", cursor: "pointer", fontFamily: "Outfit",
            }}>
            Theme: {theme === "professional" ? "Professional ◐" : "Student ◑"}
          </button>
          {booted && (
            member ? (
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--sage)" }}>
                Welcome, {member.name.split(" ")[0]} ·{" "}
                <button onClick={() => { clearMember(); setMember(null); }}
                  style={{ ...copyBtn, padding: "2px 8px" }}>Log out</button>
              </div>
            ) : (
              <button style={{ ...btn, marginTop: 12, width: "auto", padding: "9px 20px" }}
                onClick={() => setShowLogin(true)}>Log in / Get free access</button>
            )
          )}
        </header>

        <nav style={{
          display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 4,
          background: "var(--bg2)", border: "1px solid var(--line)",
          padding: 5, borderRadius: 16, marginBottom: 24,
        }}>
          {TABS.map(([letter, name], i) => (
            <button key={name} onClick={() => setTab(i)} style={{
              padding: "9px 1px", borderRadius: 11, border: "none", cursor: "pointer",
              background: tab === i ? "linear-gradient(135deg, var(--gold-soft), var(--gold))" : "transparent",
              color: tab === i ? "#0e1614" : "var(--muted)", fontFamily: "Outfit",
              display: "flex", flexDirection: "column", gap: 2, transition: "all .2s", position: "relative",
            }}>
              <span className="heal-display" style={{ fontSize: 15, fontWeight: 600 }}>
                {name === "Life Map" ? "◎" : name === "Mindset" ? "★" : letter[0]}
              </span>
              <span style={{ fontSize: 9.5, fontWeight: 500 }}>{name}</span>
              {!member && <span style={{ position: "absolute", top: 3, right: 3, fontSize: 8 }}>🔒</span>}
            </button>
          ))}
        </nav>

        <main key={tab + (member ? "-in" : "-out")}>
          {member
            ? <Active />
            : <TabPreview data={active} onUnlock={() => setShowLogin(true)} />}
        </main>

        <footer style={{ textAlign: "center", marginTop: 40, fontSize: 11, color: "var(--muted)" }}>
          Powered by your H.E.A.L.™ framework · Prototype
        </footer>
      </div>
    </div>
  );
}
