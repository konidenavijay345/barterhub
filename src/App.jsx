import { useState, useEffect, useRef, useCallback } from "react";
import { auth } from "./auth";
import { userDb, listingDb, exchangeDb, analyticsDb, chatDb, reportDb, ratingDb, appealDb, notificationDb, appConfigDb } from "./database";
import { trackPageView, trackCTA, trackEvent } from "./analytics";

const CATEGORIES = ["Electronics","Clothing","Books","Tools","Furniture","Food","Art","Sports","Vehicles","Other"];

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`; if (h > 0) return `${h}h ago`; if (m > 0) return `${m}m ago`; return "just now";
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(file);
  });
}

const CHAT_DAILY_LIMIT = 150;
const CHAT_EDIT_WINDOW_MS = 15 * 60 * 1000;

function publicUserId(user) {
  return user?.encryptedId || "Pending ID";
}

function canUseChat(user, appConfig) {
  return Boolean(user) && appConfig.chatEnabled !== false && user.chatDisabled !== true;
}

function avgRating(items, selector) {
  const values = items.map(selector).filter(v => Number(v) > 0);
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + Number(v), 0) / values.length;
}

function groupNotifications(items) {
  const now = Date.now();
  const todayKey = new Date().toDateString();
  const groups = { Today: [], "Last 7 days": [], "Last 30 days": [], Older: [] };
  items.forEach(n => {
    const t = n.createdAt ? new Date(n.createdAt).getTime() : 0;
    const age = now - t;
    if (new Date(t).toDateString() === todayKey) groups.Today.push(n);
    else if (age <= 7 * 24 * 60 * 60 * 1000) groups["Last 7 days"].push(n);
    else if (age <= 30 * 24 * 60 * 60 * 1000) groups["Last 30 days"].push(n);
    else groups.Older.push(n);
  });
  return groups;
}

function chatSecret(thread) {
  return `BarterHub.chat.${thread.id}.${(thread.participants || []).slice().sort().join(".")}`;
}

async function deriveChatKey(secret) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new TextEncoder().encode("BarterHub.Chat.v1"), iterations: 100000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function bytesToB64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function b64ToBytes(text) {
  return Uint8Array.from(atob(text), c => c.charCodeAt(0));
}

async function encryptChatText(text, thread) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveChatKey(chatSecret(thread));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
  return { ciphertext: bytesToB64(cipher), iv: bytesToB64(iv), encryption: "AES-GCM-PBKDF2-v1" };
}

async function decryptChatText(message, thread) {
  if (message.deleted) return "Message deleted";
  try {
    const key = await deriveChatKey(chatSecret(thread));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(message.iv) }, key, b64ToBytes(message.ciphertext));
    return new TextDecoder().decode(plain);
  } catch {
    return "Unable to decrypt message";
  }
}

function ChatTermsGate({ user, onAccept, onDecline }) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  async function accept() {
    setLoading(true);
    const patch = { chatTermsAcceptedAt: new Date().toISOString(), chatTermsVersion: "2026-05-20" };
    await userDb.update(user.id, patch);
    onAccept({ ...user, ...patch });
    setLoading(false);
  }
  return (
    <div style={{ maxWidth: 720, margin: "2rem auto", padding: "0 1rem" }}>
      <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "1.5rem" }}>
        <h1 style={{ margin: "0 0 1rem", fontSize: 24, fontWeight: 500, fontFamily: "Georgia, serif" }}>Chat terms and guidelines</h1>
        <p style={{ margin: "0 0 1rem", color: "#6b7280", fontSize: 14 }}>Before using chats, acknowledge these rules so conversations stay respectful and BarterHub stays protected.</p>
        {[
          "Use chat only for exchange coordination and lawful, respectful communication.",
          "You are responsible for what you send. Do not harass, threaten, scam, impersonate, share illegal content, or post private information without consent.",
          "BarterHub is not responsible for user-generated messages, opinions, promises, meetup decisions, or disputes between users.",
          "Messages are encrypted in storage, but participants can still report, copy, screenshot, or share what they receive.",
          "You may edit or delete your own message for 15 minutes after sending. After that window, the message history is locked in the app.",
          "BarterHub may restrict accounts, preserve metadata, or remove access when needed for safety, abuse prevention, legal compliance, or platform integrity.",
        ].map(item => <p key={item} style={{ margin: "0 0 10px", fontSize: 13, color: "#374151" }}>• {item}</p>)}
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 16, fontSize: 13, color: "#374151" }}>
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} style={{ marginTop: 2 }} />
          <span>I understand and agree to these chat terms and guidelines.</span>
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <button onClick={accept} disabled={!checked || loading} style={{ padding: "9px 16px", background: "#d97706", color: "white", border: "none", borderRadius: 8, opacity: !checked || loading ? 0.6 : 1 }}>{loading ? "Saving..." : "Accept and continue"}</button>
          <button onClick={onDecline} style={{ padding: "9px 16px", background: "#fff", color: "#374151", border: "0.5px solid #e5e7eb", borderRadius: 8 }}>Not now</button>
        </div>
      </div>
    </div>
  );
}

function ReportBox({ title, onSubmit, onCancel }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    await onSubmit({ reason, details });
    setReason("");
    setDetails("");
    setLoading(false);
  }
  return (
    <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "1rem", marginTop: 12 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 500 }}>{title}</h3>
      <form onSubmit={submit}>
        <select value={reason} onChange={e => setReason(e.target.value)} required style={{ width: "100%", marginBottom: 10 }}>
          <option value="">Select reason</option>
          <option value="misleading">Misleading or fake item</option>
          <option value="unsafe">Unsafe or prohibited content</option>
          <option value="abuse">Abusive or suspicious behavior</option>
          <option value="spam">Spam or scam</option>
          <option value="other">Other</option>
        </select>
        <textarea value={details} onChange={e => setDetails(e.target.value)} required rows={3} placeholder="Add details for the admin team" style={{ width: "100%", resize: "vertical", marginBottom: 10 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={loading} style={{ padding: "8px 14px", background: "#dc2626", color: "white", border: "none", borderRadius: 8, opacity: loading ? 0.7 : 1 }}>Submit report</button>
          <button type="button" onClick={onCancel} style={{ padding: "8px 14px", background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: 8 }}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function RatingBox({ exchange, listing, user, targetUser, existing, onRated }) {
  const [productRating, setProductRating] = useState(existing?.productRating || 5);
  const [userRating, setUserRating] = useState(existing?.userRating || 5);
  const [comment, setComment] = useState(existing?.comment || "");
  const [loading, setLoading] = useState(false);
  if (existing) return <p style={{ margin: "8px 0 0", fontSize: 12, color: "#16a34a" }}>You rated this exchange.</p>;
  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    await ratingDb.create({
      exchangeId: exchange.id,
      listingId: listing?.id || exchange.listingId,
      productOwnerId: listing?.userId || null,
      targetUserId: targetUser?.id || null,
      raterId: user.id,
      productRating: Number(productRating),
      userRating: Number(userRating),
      comment: comment.trim(),
    });
    await onRated();
    setLoading(false);
  }
  return (
    <form onSubmit={submit} style={{ marginTop: 10, background: "#f9fafb", borderRadius: 8, padding: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={{ fontSize: 12, color: "#6b7280" }}>Product rating
          <select value={productRating} onChange={e => setProductRating(e.target.value)} style={{ width: "100%", marginTop: 4 }}>{[5,4,3,2,1].map(n => <option key={n} value={n}>{n} stars</option>)}</select>
        </label>
        <label style={{ fontSize: 12, color: "#6b7280" }}>User rating
          <select value={userRating} onChange={e => setUserRating(e.target.value)} style={{ width: "100%", marginTop: 4 }}>{[5,4,3,2,1].map(n => <option key={n} value={n}>{n} stars</option>)}</select>
        </label>
      </div>
      <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} placeholder="Optional note" style={{ width: "100%", resize: "vertical", marginTop: 8 }} />
      <button type="submit" disabled={loading} style={{ marginTop: 8, padding: "6px 12px", background: "#d97706", color: "white", border: "none", borderRadius: 8, fontSize: 12, opacity: loading ? 0.7 : 1 }}>{loading ? "Saving..." : "Save rating"}</button>
    </form>
  );
}

const STATUS_COLORS = {
  available: { bg: "#d1fae5", text: "#065f46" },
  pending:   { bg: "#fef3c7", text: "#92400e" },
  exchanged: { bg: "#e0e7ff", text: "#3730a3" },
  accepted:  { bg: "#d1fae5", text: "#065f46" },
  declined:  { bg: "#fee2e2", text: "#991b1b" },
};

function Badge({ status }) {
  const c = STATUS_COLORS[status] || { bg: "#f3f4f6", text: "#374151" };
  return (
    <span style={{ background: c.bg, color: c.text, fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 20, textTransform: "capitalize", whiteSpace: "nowrap" }}>
      {status}
    </span>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
      <div style={{ width: 32, height: 32, border: "3px solid #e5e7eb", borderTopColor: "#d97706", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );
}

function Alert({ type, msg, onClose }) {
  if (!msg) return null;
  const colors = {
    error:   { bg: "#fef2f2", text: "#dc2626", border: "#fca5a5" },
    success: { bg: "#f0fdf4", text: "#16a34a", border: "#86efac" },
  };
  const c = colors[type] || colors.error;
  return (
    <div style={{ background: c.bg, color: c.text, border: `0.5px solid ${c.border}`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14 }}>
      <span>{msg}</span>
      {onClose && <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: c.text, fontSize: 18, lineHeight: 1, padding: "0 4px" }}>×</button>}
    </div>
  );
}

function ListingCard({ listing, users, onClick, page, currentUser }) {
  const owner = users.find(u => u.id === listing.userId);
  return (
    <div
      className="listing-card"
      onClick={() => { trackCTA(`listing_card_${listing.title}`, page, currentUser?.id); onClick(listing); }}
    >
      <div className="listing-media">
        {listing.imageBase64
          ? <img src={listing.imageBase64} alt={listing.title} />
          : (
            <div className="default-listing-art" aria-hidden="true">
              <div className="art-ring"></div>
              <div className="art-box"><span></span><span></span></div>
              <div className="art-coin">$</div>
              <div className="art-spark"></div>
            </div>
          )}
      </div>
      <div className="listing-body">
        <div className="listing-title-row">
          <h3>{listing.title}</h3>
          <Badge status={listing.status} />
        </div>
        <p className="listing-desc">{listing.description}</p>
        <div className="listing-meta">
          <span>{owner?.username || "Unknown"} · {timeAgo(listing.createdAt)}</span>
          <span>{listing.category}</span>
        </div>
        <div className="listing-wants">Wants: {listing.wantInReturn}</div>
      </div>
    </div>
  );
}

// ── Pages ─────────────────────────────────────────────────────────────────────

function LoginPage({ onLogin, onNavigate }) {
  const [id, setId] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState(""), [loading, setLoading] = useState(false);
  async function handle(e) {
    e.preventDefault(); setErr(""); setLoading(true);
    try {
      const user = await auth.login(id, pw);
      trackEvent({ type: "login", label: "login_success", page: "login", userId: user.id });
      onLogin(user);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }
  return (
    <div style={{ maxWidth: 400, margin: "4rem auto", padding: "0 1rem" }}>
      <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "2rem" }}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 500, fontFamily: "Georgia, serif" }}>Sign in to BarterHub</h2>
        </div>
        <Alert type="error" msg={err} onClose={() => setErr("")} />
        <form onSubmit={handle}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>Username or email</label>
            <input value={id} onChange={e => setId(e.target.value)} required style={{ width: "100%", boxSizing: "border-box" }} placeholder="Enter username or email" />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>Password</label>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} required style={{ width: "100%", boxSizing: "border-box" }} placeholder="Enter password" />
          </div>
          <button
            type="submit" disabled={loading}
            onClick={() => trackCTA("sign_in_button", "login")}
            style={{ width: "100%", padding: "11px", background: "#d97706", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 500, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#6b7280" }}>
          No account? <button onClick={() => { trackCTA("go_to_register", "login"); onNavigate("register"); }} style={{ background: "none", border: "none", color: "#d97706", cursor: "pointer", fontSize: 13 }}>Register</button>
        </p>
        <p style={{ textAlign: "center", marginTop: 8, fontSize: 13 }}>
          <button onClick={() => onNavigate("reset-password")} style={{ background: "none", border: "none", color: "#d97706", cursor: "pointer", fontSize: 13 }}>Forgot password?</button>
        </p>
        <p style={{ textAlign: "center", marginTop: 8, fontSize: 13 }}>
          <button onClick={() => onNavigate("appeal")} style={{ background: "none", border: "none", color: "#d97706", cursor: "pointer", fontSize: 13 }}>Account suspended? Appeal</button>
        </p>
        <div style={{ marginTop: 16, padding: "10px 12px", background: "#f9fafb", borderRadius: 8, fontSize: 12, color: "#6b7280" }}>
          Default admin: <strong>admin</strong> / <strong>admin123</strong>
        </div>
      </div>
    </div>
  );
}

function RegisterPage({ onLogin, onNavigate }) {
  const [form, setForm] = useState({ username: "", email: "", password: "", confirm: "" });
  const [err, setErr] = useState(""), [loading, setLoading] = useState(false);
  async function handle(e) {
    e.preventDefault();
    if (form.password !== form.confirm) { setErr("Passwords don't match"); return; }
    if (form.password.length < 6) { setErr("Password must be at least 6 characters"); return; }
    setErr(""); setLoading(true);
    try {
      const user = await auth.register(form.username, form.email, form.password);
      await auth.login(form.username, form.password);
      trackEvent({ type: "register", label: "register_success", page: "register", userId: user.id });
      onLogin(user);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }
  const fields = [
    { k: "username", l: "Username", t: "text", p: "Choose a username" },
    { k: "email",    l: "Email",    t: "email", p: "you@example.com" },
    { k: "password", l: "Password", t: "password", p: "Min 6 characters" },
    { k: "confirm",  l: "Confirm password", t: "password", p: "Repeat password" },
  ];
  return (
    <div style={{ maxWidth: 400, margin: "4rem auto", padding: "0 1rem" }}>
      <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "2rem" }}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <h2 style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 500, fontFamily: "Georgia, serif" }}>Join BarterHub</h2>
        </div>
        <Alert type="error" msg={err} onClose={() => setErr("")} />
        <form onSubmit={handle}>
          {fields.map(f => (
            <div key={f.k} style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>{f.l}</label>
              <input type={f.t} value={form[f.k]} placeholder={f.p} required onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))} style={{ width: "100%", boxSizing: "border-box" }} />
            </div>
          ))}
          <button
            type="submit" disabled={loading}
            onClick={() => trackCTA("create_account_button", "register")}
            style={{ width: "100%", padding: "11px", background: "#d97706", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 500, marginTop: 4, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "#6b7280" }}>
          Already a member? <button onClick={() => { trackCTA("go_to_login", "register"); onNavigate("login"); }} style={{ background: "none", border: "none", color: "#d97706", cursor: "pointer", fontSize: 13 }}>Sign in</button>
        </p>
      </div>
    </div>
  );
}

function ResetPasswordPage({ onNavigate }) {
  const [form, setForm] = useState({ username: "", email: "", password: "", confirm: "" });
  const [err, setErr] = useState(""), [success, setSuccess] = useState(""), [loading, setLoading] = useState(false);
  async function handle(e) {
    e.preventDefault();
    if (form.password !== form.confirm) { setErr("Passwords don't match"); return; }
    setErr(""); setSuccess(""); setLoading(true);
    try {
      await auth.resetPasswordByIdentity(form.username, form.email, form.password);
      setSuccess("Password updated. You can sign in now.");
      setForm({ username: "", email: "", password: "", confirm: "" });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div style={{ maxWidth: 420, margin: "4rem auto", padding: "0 1rem" }}>
      <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "2rem" }}>
        <h2 style={{ margin: "0 0 1.25rem", fontSize: 22, fontWeight: 500, fontFamily: "Georgia, serif", textAlign: "center" }}>Reset password</h2>
        <Alert type="error" msg={err} onClose={() => setErr("")} />
        <Alert type="success" msg={success} onClose={() => setSuccess("")} />
        <form onSubmit={handle}>
          {[
            { k: "username", l: "Username", t: "text" },
            { k: "email", l: "Email", t: "email" },
            { k: "password", l: "New password", t: "password" },
            { k: "confirm", l: "Confirm new password", t: "password" },
          ].map(f => (
            <div key={f.k} style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>{f.l}</label>
              <input type={f.t} value={form[f.k]} required onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))} style={{ width: "100%" }} />
            </div>
          ))}
          <button type="submit" disabled={loading} style={{ width: "100%", padding: "11px", background: "#d97706", color: "white", border: "none", borderRadius: 8, fontSize: 14, opacity: loading ? 0.7 : 1 }}>{loading ? "Updating..." : "Update password"}</button>
        </form>
        <button onClick={() => onNavigate("login")} style={{ marginTop: 14, width: "100%", background: "none", border: "none", color: "#d97706", fontSize: 13 }}>Back to sign in</button>
      </div>
    </div>
  );
}

function AppealPage({ onNavigate }) {
  const [form, setForm] = useState({ username: "", email: "", message: "" });
  const [err, setErr] = useState(""), [success, setSuccess] = useState(""), [loading, setLoading] = useState(false);
  async function handle(e) {
    e.preventDefault();
    setErr(""); setSuccess(""); setLoading(true);
    try {
      const users = await userDb.getAll();
      const target = users.find(u => u.username.toLowerCase() === form.username.toLowerCase().trim() && u.email.toLowerCase() === form.email.toLowerCase().trim());
      await appealDb.create({
        userId: target?.id || null,
        username: form.username.trim(),
        email: form.email.toLowerCase().trim(),
        message: form.message.trim(),
      });
      setSuccess("Appeal submitted. Admin will review it in moderation.");
      setForm({ username: "", email: "", message: "" });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div style={{ maxWidth: 520, margin: "4rem auto", padding: "0 1rem" }}>
      <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "2rem" }}>
        <h2 style={{ margin: "0 0 1.25rem", fontSize: 22, fontWeight: 500, fontFamily: "Georgia, serif", textAlign: "center" }}>Account appeal</h2>
        <Alert type="error" msg={err} onClose={() => setErr("")} />
        <Alert type="success" msg={success} onClose={() => setSuccess("")} />
        <form onSubmit={handle}>
          <input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} placeholder="Username" required style={{ width: "100%", marginBottom: 12 }} />
          <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="Email" required style={{ width: "100%", marginBottom: 12 }} />
          <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} placeholder="Explain why the suspension should be reviewed" rows={4} required style={{ width: "100%", resize: "vertical", marginBottom: 12 }} />
          <button type="submit" disabled={loading} style={{ width: "100%", padding: "11px", background: "#d97706", color: "white", border: "none", borderRadius: 8, opacity: loading ? 0.7 : 1 }}>{loading ? "Submitting..." : "Submit appeal"}</button>
        </form>
        <button onClick={() => onNavigate("login")} style={{ marginTop: 14, width: "100%", background: "none", border: "none", color: "#d97706", fontSize: 13 }}>Back to sign in</button>
      </div>
    </div>
  );
}

function SettingsPage({ darkMode, onDarkModeChange }) {
  return (
    <div style={{ maxWidth: 560, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: 24, fontWeight: 500, fontFamily: "Georgia, serif", marginBottom: "1.5rem" }}>Settings</h1>
      <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "1.5rem" }}>
        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, cursor: "pointer" }}>
          <span>
            <span style={{ display: "block", fontSize: 15, fontWeight: 500 }}>Dark mode</span>
            <span style={{ display: "block", fontSize: 12, color: "#6b7280", marginTop: 2 }}>Use a darker interface across BarterHub.</span>
          </span>
          <input type="checkbox" checked={darkMode} onChange={e => onDarkModeChange(e.target.checked)} style={{ width: 18, height: 18 }} />
        </label>
      </div>
    </div>
  );
}

function HomePage({ onNavigate, listings, users, currentUser, onUserUpdate, appConfig }) {
  const featured = listings.filter(l => l.status === "available").slice(0, 6);
  async function dismissChatBanner() {
    if (!currentUser) return;
    await userDb.update(currentUser.id, { messagingBannerSeen: true });
    onUserUpdate({ ...currentUser, messagingBannerSeen: true });
  }
  return (
    <div className="landing-page">
      <section className="barter-hero">
        <div className="barter-hero-copy">
          <p className="hero-kicker">Community barter marketplace</p>
          <h1>Barter smarter, swap happier.</h1>
          <p>Post what you have, discover what you need, and make trusted exchanges with chats, ratings, and moderation built in.</p>
          <div className="hero-points">
            <span>Free local swaps</span>
            <span>Encrypted exchange chats</span>
            <span>Rated community profiles</span>
          </div>
          <div className="hero-actions">
            <button onClick={() => { trackCTA("hero_browse_listings", "home", currentUser?.id); onNavigate("browse"); }}
              className="brand-btn brand-btn-primary">
            Browse listings
            </button>
            <button onClick={() => { trackCTA("hero_post_item", "home", currentUser?.id); onNavigate("post"); }}
              className="brand-btn brand-btn-secondary">
            Post an item
            </button>
          </div>
        </div>
        <div className="barter-visual" aria-hidden="true">
          <div className="swap-ring ring-a"></div>
          <div className="swap-ring ring-b"></div>
          <div className="swap-item swap-item-a"></div>
          <div className="swap-item swap-item-b"></div>
          <div className="swap-hand hand-top"></div>
          <div className="swap-hand hand-bottom"></div>
          <div className="swap-box"><span></span><span></span><span></span></div>
          <div className="chat-illustration">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <div className="swap-tag">$</div>
          <div className="spark spark-one"></div>
          <div className="spark spark-two"></div>
          <div className="dot dot-one"></div>
          <div className="dot dot-two"></div>
          <div className="dot dot-three"></div>
        </div>
      </section>

      {canUseChat(currentUser, appConfig) && !currentUser.messagingBannerSeen && (
        <div className="chat-launch-wrap">
          <div className="chat-launch-banner">
            <div>
              <p>Encrypted chats are now live</p>
              <span>Accepted exchanges can now continue in a private chat with typing status.</span>
            </div>
            <button onClick={dismissChatBanner}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="landing-section">
        <h2>How it works</h2>
        <div className="how-grid">
          {[
            { icon: "📸", title: "Post your item",  desc: "List what you have with a photo and description" },
            { icon: "🔍", title: "Browse offers",   desc: "Find items you want from the community" },
            { icon: "🤝", title: "Make an offer",   desc: "Propose what you'll give in return" },
            { icon: "✅", title: "Swap!",           desc: "Meet and exchange your items" },
          ].map((s, i) => (
            <div key={i} className="how-card">
              <div>{s.icon}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {featured.length > 0 && (
        <div className="landing-section listings-section">
          <div className="section-head">
            <h2>Recent listings</h2>
            <button onClick={() => { trackCTA("home_see_all", "home", currentUser?.id); onNavigate("browse"); }}
              className="text-action">See all →</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 16 }}>
            {featured.map(l => (
              <ListingCard key={l.id} listing={l} users={users} page="home" currentUser={currentUser}
                onClick={() => onNavigate("item", l.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BrowsePage({ listings, users, onNavigate, currentUser }) {
  const [search, setSearch] = useState(""), [cat, setCat] = useState(""), [status, setStatus] = useState("available");
  const filtered = listings.filter(l => {
    const ms = !search || l.title.toLowerCase().includes(search.toLowerCase()) || l.description.toLowerCase().includes(search.toLowerCase());
    return ms && (!cat || l.category === cat) && (!status || l.status === status);
  });
  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ margin: "0 0 1.5rem", fontSize: 24, fontWeight: 500, fontFamily: "Georgia, serif" }}>Browse listings</h1>
      <div style={{ display: "flex", gap: 10, marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <input value={search} onChange={e => { setSearch(e.target.value); trackCTA("search_input", "browse", currentUser?.id); }} placeholder="Search items…" style={{ flex: 1, minWidth: 180 }} />
        <select value={cat} onChange={e => { setCat(e.target.value); trackCTA(`filter_category_${e.target.value}`, "browse", currentUser?.id); }} style={{ minWidth: 140 }}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ minWidth: 120 }}>
          <option value="">All statuses</option>
          <option value="available">Available</option>
          <option value="pending">Pending</option>
          <option value="exchanged">Exchanged</option>
        </select>
      </div>
      <p style={{ margin: "0 0 1rem", fontSize: 13, color: "#6b7280" }}>{filtered.length} listing{filtered.length !== 1 ? "s" : ""} found</p>
      {filtered.length === 0
        ? <div style={{ textAlign: "center", padding: "4rem 0", color: "#6b7280" }}>No listings found.</div>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 16 }}>
            {filtered.map(l => <ListingCard key={l.id} listing={l} users={users} page="browse" currentUser={currentUser} onClick={() => onNavigate("item", l.id)} />)}
          </div>}
    </div>
  );
}

function PostItemPage({ user, onPosted, onNavigate }) {
  const [form, setForm] = useState({ title: "", description: "", category: "", wantInReturn: "" });
  const [image, setImage] = useState(null), [preview, setPreview] = useState(null);
  const [err, setErr] = useState(""), [success, setSuccess] = useState(""), [loading, setLoading] = useState(false);
  const fileRef = useRef();

  if (!user) return (
    <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
      <p>Sign in to post items.</p>
      <button onClick={() => onNavigate("login")} style={{ color: "#d97706", background: "none", border: "none", cursor: "pointer", fontSize: 15 }}>Sign in →</button>
    </div>
  );

  async function handleImage(e) {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setErr("Image must be under 3MB"); return; }
    const b64 = await fileToBase64(file); setImage(b64); setPreview(b64);
  }

  async function handle(e) {
    e.preventDefault();
    if (!form.title || !form.description || !form.category || !form.wantInReturn) { setErr("Please fill all required fields"); return; }
    setErr(""); setLoading(true);
    try {
      await listingDb.create({ userId: user.id, title: form.title.trim(), description: form.description.trim(), category: form.category, wantInReturn: form.wantInReturn.trim(), imageBase64: image || null, status: "available" });
      trackEvent({ type: "listing_posted", label: form.title, page: "post", userId: user.id });
      setSuccess("Your item has been posted successfully!");
      setForm({ title: "", description: "", category: "", wantInReturn: "" }); setImage(null); setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      onPosted();
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }

  return (
    <div style={{ maxWidth: 600, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: 24, fontWeight: 500, fontFamily: "Georgia, serif", marginBottom: "1.5rem" }}>Post an item</h1>
      <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "2rem" }}>
        <Alert type="error" msg={err} onClose={() => setErr("")} />
        <Alert type="success" msg={success} onClose={() => setSuccess("")} />
        <form onSubmit={handle}>
          {[
            { k: "title", l: "Item title", p: "e.g. Vintage guitar, Mountain bike…" },
            { k: "wantInReturn", l: "What do you want in return?", p: "e.g. Books, electronics, cooking equipment…" },
          ].map(f => (
            <div key={f.k} style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>{f.l} *</label>
              <input value={form[f.k]} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))} required placeholder={f.p} style={{ width: "100%", boxSizing: "border-box" }} />
            </div>
          ))}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>Category *</label>
            <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} required style={{ width: "100%", boxSizing: "border-box" }}>
              <option value="">Select a category</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>Description *</label>
            <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} required placeholder="Describe the item, its condition, age, any defects…" rows={4} style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>Photo (optional, max 3MB)</label>
            {preview && (
              <div style={{ marginBottom: 8, position: "relative", display: "inline-block" }}>
                <img src={preview} alt="Preview" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 8, display: "block" }} />
                <button type="button" onClick={() => { setImage(null); setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
                  style={{ position: "absolute", top: -6, right: -6, background: "#ef4444", color: "white", border: "none", borderRadius: "50%", width: 18, height: 18, cursor: "pointer", fontSize: 13, lineHeight: "18px", textAlign: "center", padding: 0 }}>×</button>
              </div>
            )}
            <input type="file" accept="image/*" onChange={handleImage} ref={fileRef} style={{ fontSize: 13 }} />
          </div>
          <button type="submit" disabled={loading}
            onClick={() => trackCTA("post_item_submit", "post", user.id)}
            style={{ width: "100%", padding: "12px", background: "#d97706", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 15, fontWeight: 500, opacity: loading ? 0.7 : 1 }}>
            {loading ? "Posting…" : "Post item"}
          </button>
        </form>
      </div>
    </div>
  );
}

function ItemDetailPage({ listingId, listings, users, exchanges, ratings, user, appConfig, onNavigate, onRefresh, onReportCreated }) {
  const listing = listings.find(l => l.id === listingId);
  const [offerForm, setOfferForm] = useState({ title: "", description: "" });
  const [offerImage, setOfferImage] = useState(null);
  const [err, setErr] = useState(""), [success, setSuccess] = useState(""), [loading, setLoading] = useState(false), [showOffer, setShowOffer] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const fileRef = useRef();

  if (!listing) return (
    <div style={{ textAlign: "center", padding: "4rem" }}>
      <p>Listing not found.</p>
      <button onClick={() => onNavigate("browse")} style={{ color: "#d97706", background: "none", border: "none", cursor: "pointer" }}>← Browse</button>
    </div>
  );

  const owner = users.find(u => u.id === listing.userId);
  const isOwner = user && user.id === listing.userId;
  const itemExchanges = exchanges.filter(e => e.listingId === listing.id);
  const myOffer = user && itemExchanges.find(e => e.offererId === user.id);
  const productScore = avgRating(ratings.filter(r => r.listingId === listing.id), r => r.productRating);
  const ownerScore = owner && avgRating(ratings.filter(r => r.targetUserId === owner.id), r => r.userRating);

  async function handleOfferImage(e) {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 3 * 1024 * 1024) { setErr("Image must be under 3MB"); return; }
    setOfferImage(await fileToBase64(file));
  }

  async function submitOffer(e) {
    e.preventDefault(); if (!user) { onNavigate("login"); return; }
    if (!offerForm.title || !offerForm.description) { setErr("Fill all offer fields"); return; }
    setErr(""); setLoading(true);
    try {
      await exchangeDb.create({ listingId: listing.id, offererId: user.id, offerTitle: offerForm.title, offerDescription: offerForm.description, offerImage: offerImage || null, status: "pending" });
      await listingDb.update(listing.id, { status: "pending" });
      trackEvent({ type: "offer_submitted", label: offerForm.title, page: "item", userId: user.id, extra: { listingId: listing.id } });
      setSuccess("Offer submitted!"); setShowOffer(false); setOfferForm({ title: "", description: "" }); setOfferImage(null); onRefresh();
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }

  async function updateExchangeStatus(exId, status) {
    const ex = itemExchanges.find(x => x.id === exId);
    await exchangeDb.update(exId, { status });
    if (status === "accepted") {
      await listingDb.update(listing.id, { status: "exchanged" });
      const offerer = users.find(u => u.id === ex?.offererId);
      if (canUseChat(user, appConfig) && canUseChat(offerer, appConfig)) await chatDb.ensureThreadForExchange(ex, { ...listing, ownerUsername: owner?.username });
    }
    onRefresh();
  }

  async function deleteListing() {
    if (!confirm("Delete this listing?")) return;
    await listingDb.delete(listing.id);
    onNavigate("browse");
  }

  async function submitReport(data) {
    if (!user) { onNavigate("login"); return; }
    await reportDb.create({
      type: "listing",
      reporterId: user.id,
      listingId: listing.id,
      listingTitle: listing.title,
      reportedUserId: listing.userId,
      reason: data.reason,
      details: data.details,
    });
    setShowReport(false);
    setSuccess("Report submitted for admin review.");
    await onReportCreated?.();
  }

  return (
    <div style={{ maxWidth: 860, margin: "2rem auto", padding: "0 1rem" }}>
      <button onClick={() => onNavigate("browse")} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", marginBottom: "1rem", fontSize: 14 }}>← Back to browse</button>
      <Alert type="error" msg={err} onClose={() => setErr("")} />
      <Alert type="success" msg={success} onClose={() => setSuccess("")} />
      <div className="detail-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
        <div style={{ background: "#f9fafb", borderRadius: 12, overflow: "hidden", minHeight: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {listing.imageBase64
            ? <img src={listing.imageBase64} alt={listing.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span style={{ fontSize: 64, color: "#9ca3af" }}>📦</span>}
        </div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500, fontFamily: "Georgia, serif", flex: 1 }}>{listing.title}</h1>
            <Badge status={listing.status} />
          </div>
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 8 }}>{listing.category} · by <strong>{owner?.username || "Unknown"}</strong> · {timeAgo(listing.createdAt)}</p>
          <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px" }}>Product {productScore ? productScore.toFixed(1) : "not rated"} · Seller genuine score {ownerScore ? ownerScore.toFixed(1) : "not rated"}</p>
          <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>{listing.description}</p>
          <div style={{ background: "#fffbeb", border: "0.5px solid #fbbf24", borderRadius: 8, padding: "10px 12px", marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: "#92400e" }}><strong>Looking for:</strong> {listing.wantInReturn}</p>
          </div>

          {isOwner ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {listing.status !== "exchanged" && (
                <button onClick={() => listingDb.update(listing.id, { status: listing.status === "available" ? "pending" : "available" }).then(onRefresh)}
                  style={{ padding: "8px 14px", background: "#f9fafb", border: "0.5px solid #e5e7eb", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                  {listing.status === "available" ? "Mark pending" : "Mark available"}
                </button>
              )}
              {listing.status !== "exchanged" && (
                <button onClick={() => listingDb.update(listing.id, { status: "exchanged" }).then(onRefresh)}
                  style={{ padding: "8px 14px", background: "#d1fae5", border: "0.5px solid #6ee7b7", color: "#065f46", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                  Mark exchanged
                </button>
              )}
              <button onClick={deleteListing} style={{ padding: "8px 14px", background: "#fee2e2", border: "0.5px solid #fca5a5", color: "#991b1b", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                Delete listing
              </button>
            </div>
          ) : listing.status === "available" && !myOffer ? (
            <button
              onClick={() => { trackCTA("make_an_offer", "item", user?.id); user ? setShowOffer(true) : onNavigate("login"); }}
              style={{ padding: "12px 24px", background: "#d97706", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 15, fontWeight: 500 }}>
              Make an offer
            </button>
          ) : myOffer ? (
            <div style={{ padding: "10px 12px", background: "#eff6ff", borderRadius: 8, fontSize: 13, color: "#2563eb" }}>
              Your offer is <strong>{myOffer.status}</strong>
            </div>
          ) : (
            <div style={{ padding: "10px 12px", background: "#f9fafb", borderRadius: 8, fontSize: 13, color: "#6b7280" }}>
              This item is no longer available for offers.
            </div>
          )}
          {!isOwner && (
            <button onClick={() => user ? setShowReport(true) : onNavigate("login")} style={{ marginTop: 10, padding: "8px 12px", background: "#fff", color: "#dc2626", border: "0.5px solid #fca5a5", borderRadius: 8, fontSize: 13 }}>Report listing</button>
          )}
          {showReport && <ReportBox title="Report this listing" onSubmit={submitReport} onCancel={() => setShowReport(false)} />}
        </div>
      </div>

      {showOffer && (
        <div style={{ marginBottom: 24, padding: "1.5rem", background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12 }}>
          <h3 style={{ margin: "0 0 1rem", fontSize: 16, fontWeight: 500 }}>Your offer</h3>
          <form onSubmit={submitOffer}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>Item you're offering *</label>
              <input value={offerForm.title} onChange={e => setOfferForm(p => ({ ...p, title: e.target.value }))} required placeholder="What are you offering?" style={{ width: "100%", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>Description *</label>
              <textarea value={offerForm.description} onChange={e => setOfferForm(p => ({ ...p, description: e.target.value }))} required placeholder="Describe your item…" rows={3} style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>Photo of your offer (optional)</label>
              {offerImage && <img src={offerImage} alt="" style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 8, marginBottom: 6, display: "block" }} />}
              <input type="file" accept="image/*" onChange={handleOfferImage} ref={fileRef} style={{ fontSize: 13 }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={loading} style={{ padding: "10px 20px", background: "#d97706", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 500, opacity: loading ? 0.7 : 1 }}>
                {loading ? "Submitting…" : "Submit offer"}
              </button>
              <button type="button" onClick={() => setShowOffer(false)} style={{ padding: "10px 20px", border: "0.5px solid #e5e7eb", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 14 }}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {isOwner && itemExchanges.length > 0 && (
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 12 }}>Offers received ({itemExchanges.length})</h3>
          {itemExchanges.map(ex => {
            const offerer = users.find(u => u.id === ex.offererId);
            const targetUser = offerer;
            const existingRating = ratings.find(r => r.exchangeId === ex.id && r.raterId === user.id);
            return (
              <div key={ex.id} style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "1rem", marginBottom: 10, display: "flex", gap: 12 }}>
                {ex.offerImage && <img src={ex.offerImage} alt="" style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, gap: 8 }}><strong style={{ fontSize: 14 }}>{ex.offerTitle}</strong><Badge status={ex.status} /></div>
                  <p style={{ margin: "0 0 4px", fontSize: 13, color: "#6b7280" }}>{ex.offerDescription}</p>
                  {ex.status === "accepted" && canUseChat(user, appConfig) && canUseChat(offerer, appConfig) && (
                    <button onClick={() => onNavigate("chat", `exchange_${ex.id}`)} style={{ marginBottom: 6, padding: "5px 12px", background: "#111827", border: "none", color: "white", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>Open chat</button>
                  )}
                  <p style={{ margin: "0 0 8px", fontSize: 12, color: "#9ca3af" }}>by {offerer?.username} · {timeAgo(ex.createdAt)}</p>
                  {ex.status === "pending" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => updateExchangeStatus(ex.id, "accepted")} style={{ padding: "5px 12px", background: "#d1fae5", border: "0.5px solid #6ee7b7", color: "#065f46", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>Accept</button>
                      <button onClick={() => updateExchangeStatus(ex.id, "declined")} style={{ padding: "5px 12px", background: "#fee2e2", border: "0.5px solid #fca5a5", color: "#991b1b", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>Decline</button>
                    </div>
                  )}
                  {ex.status === "accepted" && listing && (
                    <RatingBox exchange={ex} listing={listing} user={user} targetUser={targetUser} existing={existingRating} onRated={onRefresh} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MyListingsPage({ user, listings, exchanges, onNavigate, onRefresh }) {
  if (!user) return <div style={{ textAlign: "center", padding: "4rem" }}><button onClick={() => onNavigate("login")} style={{ color: "#d97706", background: "none", border: "none", cursor: "pointer" }}>Sign in →</button></div>;
  const myListings = listings.filter(l => l.userId === user.id);
  return (
    <div style={{ maxWidth: 900, margin: "2rem auto", padding: "0 1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 500, fontFamily: "Georgia, serif" }}>My listings ({myListings.length})</h1>
        <button onClick={() => { trackCTA("my_listings_post_item", "my-listings", user.id); onNavigate("post"); }}
          style={{ padding: "8px 16px", background: "#d97706", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14 }}>+ Post item</button>
      </div>
      {myListings.length === 0
        ? <div style={{ textAlign: "center", padding: "4rem 0", color: "#6b7280" }}>No listings yet.</div>
        : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 16 }}>
            {myListings.map(l => {
              const exCount = exchanges.filter(e => e.listingId === l.id).length;
              return (
                <div key={l.id} style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ height: 150, background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {l.imageBase64 ? <img src={l.imageBase64} alt={l.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 40 }}>📦</span>}
                  </div>
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, gap: 6 }}><h3 style={{ margin: 0, fontSize: 14, fontWeight: 500, flex: 1 }}>{l.title}</h3><Badge status={l.status} /></div>
                    <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b7280" }}>{exCount} offer{exCount !== 1 ? "s" : ""}</p>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => onNavigate("item", l.id)} style={{ flex: 1, padding: "6px", fontSize: 12, borderRadius: 8, border: "0.5px solid #e5e7eb", background: "#f9fafb", cursor: "pointer" }}>View & offers</button>
                      <button onClick={async () => { if (!confirm("Delete?")) return; await listingDb.delete(l.id); onRefresh(); }} style={{ padding: "6px 10px", fontSize: 12, borderRadius: 8, border: "0.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b", cursor: "pointer" }}>Del</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>}
    </div>
  );
}

function MyExchangesPage({ user, listings, exchanges, users, ratings, appConfig, onNavigate, onRated }) {
  if (!user) return <div style={{ textAlign: "center", padding: "4rem" }}><button onClick={() => onNavigate("login")} style={{ color: "#d97706", background: "none", border: "none", cursor: "pointer" }}>Sign in →</button></div>;
  const myOffers = exchanges.filter(e => e.offererId === user.id);
  return (
    <div style={{ maxWidth: 800, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: 24, fontWeight: 500, fontFamily: "Georgia, serif", marginBottom: "1.5rem" }}>My exchange offers ({myOffers.length})</h1>
      {myOffers.length === 0
        ? <div style={{ textAlign: "center", padding: "4rem 0", color: "#6b7280" }}>No offers yet. <button onClick={() => onNavigate("browse")} style={{ color: "#d97706", background: "none", border: "none", cursor: "pointer" }}>Browse items →</button></div>
        : myOffers.map(ex => {
            const listing = listings.find(l => l.id === ex.listingId);
            const lo = listing && users.find(u => u.id === listing.userId);
            const targetUser = listing?.userId === user.id ? users.find(u => u.id === ex.offererId) : lo;
            const existingRating = ratings.find(r => r.exchangeId === ex.id && r.raterId === user.id);
            return (
              <div key={ex.id} style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "1rem", marginBottom: 10, display: "flex", gap: 12 }}>
                {ex.offerImage && <img src={ex.offerImage} alt="" style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}><span style={{ fontSize: 14, fontWeight: 500 }}>You offered: {ex.offerTitle}</span><Badge status={ex.status} /></div>
                  <p style={{ margin: "0 0 4px", fontSize: 13, color: "#6b7280" }}>{ex.offerDescription}</p>
                  {ex.status === "accepted" && canUseChat(user, appConfig) && canUseChat(targetUser, appConfig) && listing && (
                    <button onClick={() => onNavigate("chat", `exchange_${ex.id}`)} style={{ margin: "8px 0", padding: "5px 12px", background: "#111827", border: "none", color: "white", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>Open chat</button>
                  )}
                  {ex.status === "accepted" && listing && (
                    <RatingBox exchange={ex} listing={listing} user={user} targetUser={targetUser} existing={existingRating} onRated={onRated} />
                  )}
                  <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>For: <button onClick={() => listing && onNavigate("item", listing.id)} style={{ background: "none", border: "none", color: "#d97706", cursor: "pointer", fontSize: 12, padding: 0 }}>{listing?.title || "Deleted listing"}</button>{lo && ` by ${lo.username}`} · {timeAgo(ex.createdAt)}</p>
                </div>
              </div>
            );
          })}
    </div>
  );
}

function ChatsPage({ user, users, listings, exchanges, selectedThreadId, appConfig, onNavigate, onUserUpdate }) {
  const [threads, setThreads] = useState([]);
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [plainMessages, setPlainMessages] = useState([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [dailyCount, setDailyCount] = useState(0);
  const [editing, setEditing] = useState(null);
  const scrollRef = useRef(null);
  const typingTimer = useRef(null);

  useEffect(() => {
    if (!user) return;
    chatDb.getThreadsForUser(user.id).then(setThreads);
  }, [user, selectedThreadId]);

  useEffect(() => {
    if (!selectedThreadId) {
      setThread(null);
      setMessages([]);
      return undefined;
    }
    const unsubThread = chatDb.subscribeThread(selectedThreadId, setThread);
    const unsubMessages = chatDb.subscribeMessages(selectedThreadId, setMessages);
    return () => {
      unsubThread();
      unsubMessages();
      if (user) chatDb.setTyping(selectedThreadId, user.id, false);
    };
  }, [selectedThreadId, user?.id]);

  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    setDailyCount(user.chatDailyDate === today ? Number(user.chatMessageCountToday) || 0 : 0);
  }, [user?.id, user?.chatDailyDate, user?.chatMessageCountToday]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!thread) {
        setPlainMessages([]);
        return;
      }
      const decrypted = await Promise.all(messages.map(async m => ({ ...m, plain: await decryptChatText(m, thread) })));
      if (!cancelled) setPlainMessages(decrypted);
    }
    run();
    return () => { cancelled = true; };
  }, [messages, thread]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [plainMessages.length]);

  if (!user) return <div style={{ textAlign: "center", padding: "4rem" }}><button onClick={() => onNavigate("login")} style={{ color: "#d97706", background: "none", border: "none", cursor: "pointer" }}>Sign in to chat</button></div>;
  if (!canUseChat(user, appConfig)) return (
    <div style={{ maxWidth: 640, margin: "4rem auto", padding: "0 1rem", textAlign: "center" }}>
      <div style={{ background: "#fff", border: "0.5px solid #d8dee4", borderRadius: 8, padding: "2rem" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 600 }}>Chats are temporarily disabled</h1>
        <p style={{ margin: "0 0 16px", color: "#57606a", fontSize: 14 }}>{appConfig.chatEnabled === false ? "The admin team has turned off chat while we tune the experience." : "Chat is disabled for your account. Contact support if this feels wrong."}</p>
        <button onClick={() => onNavigate("home")} style={{ padding: "8px 14px", background: "#1f883d", color: "white", border: "none", borderRadius: 6 }}>Back home</button>
      </div>
    </div>
  );
  if (!user.chatTermsAcceptedAt) return <ChatTermsGate user={user} onAccept={onUserUpdate} onDecline={() => onNavigate("home")} />;

  const acceptedThreads = exchanges
    .filter(ex => ex.status === "accepted")
    .map(ex => {
      const listing = listings.find(l => l.id === ex.listingId);
      if (!listing) return null;
      if (listing.userId !== user.id && ex.offererId !== user.id) return null;
      const otherId = listing.userId === user.id ? ex.offererId : listing.userId;
      const other = users.find(u => u.id === otherId);
      if (!canUseChat(other, appConfig)) return null;
      return { id: `exchange_${ex.id}`, exchange: ex, listing, other };
    })
    .filter(Boolean);

  const active = thread || threads.find(t => t.id === selectedThreadId);
  const listing = active && listings.find(l => l.id === active.listingId);
  const otherId = active?.participants?.find(id => id !== user.id);
  const other = users.find(u => u.id === otherId);
  const otherTypingAt = active?.typing?.[otherId];
  const otherIsTyping = otherTypingAt && Date.now() - new Date(otherTypingAt).getTime() < 5000;
  const blocked = dailyCount >= CHAT_DAILY_LIMIT;

  async function ensureAndOpen(item) {
    await chatDb.ensureThreadForExchange(item.exchange, { ...item.listing, ownerUsername: users.find(u => u.id === item.listing.userId)?.username });
    onNavigate("chat", item.id);
  }

  async function handleTyping(value) {
    setText(value);
    if (!selectedThreadId) return;
    await chatDb.setTyping(selectedThreadId, user.id, Boolean(value.trim()));
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => chatDb.setTyping(selectedThreadId, user.id, false), 1800);
  }

  async function send(e) {
    e.preventDefault();
    if (!thread || !text.trim() || (blocked && !editing)) return;
    setErr("");
    setSending(true);
    try {
      if (editing) {
        if (Date.now() - new Date(editing.createdAt).getTime() > CHAT_EDIT_WINDOW_MS) {
          setErr("Messages can only be edited within 15 minutes.");
          return;
        }
        const encrypted = await encryptChatText(text.trim(), thread);
        await chatDb.updateMessage(thread.id, editing.id, encrypted);
        setText("");
        setEditing(null);
        return;
      }
      const today = new Date().toISOString().slice(0, 10);
      const currentCount = user.chatDailyDate === today ? Number(user.chatMessageCountToday) || 0 : 0;
      if (currentCount >= CHAT_DAILY_LIMIT) {
        setDailyCount(currentCount);
        await userDb.update(user.id, { messageBlockedDay: today });
        setErr("Daily chat limit reached. Messaging unlocks again tomorrow.");
        return;
      }
      const encrypted = await encryptChatText(text.trim(), thread);
      await chatDb.sendMessage(thread.id, { senderId: user.id, ...encrypted });
      setText("");
      await chatDb.setTyping(thread.id, user.id, false);
      const nextCount = currentCount + 1;
      const patch = { chatDailyDate: today, chatMessageCountToday: nextCount, messageBlockedDay: nextCount >= CHAT_DAILY_LIMIT ? today : null };
      await userDb.update(user.id, patch);
      setDailyCount(nextCount);
      onUserUpdate?.({ ...user, ...patch });
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  }

  async function deleteOwnMessage(message) {
    if (!thread || message.senderId !== user.id) return;
    if (Date.now() - new Date(message.createdAt).getTime() > CHAT_EDIT_WINDOW_MS) {
      setErr("Messages can only be deleted within 15 minutes.");
      return;
    }
    if (!confirm("Delete this message?")) return;
    await chatDb.deleteMessage(thread.id, message.id);
  }

  async function reportMessage(message) {
    if (!thread || !user || message.deleted) return;
    const details = prompt("Tell admins what is wrong with this message");
    if (!details) return;
    await reportDb.create({
      type: "message",
      reporterId: user.id,
      reportedUserId: message.senderId,
      threadId: thread.id,
      listingId: thread.listingId,
      reason: "message_report",
      details,
      messageText: message.plain,
      conversationSnapshot: plainMessages.slice(-30).map(m => ({
        senderId: m.senderId,
        senderName: users.find(u => u.id === m.senderId)?.username || "User",
        text: m.plain,
        createdAt: m.createdAt,
        editedAt: m.editedAt || null,
        deleted: Boolean(m.deleted),
      })),
    });
    setErr("Message report submitted for admin review.");
  }

  return (
    <div style={{ maxWidth: 1000, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: 24, fontWeight: 500, fontFamily: "Georgia, serif", marginBottom: "1.5rem" }}>Chats</h1>
      <div className="chat-grid" style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
        <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, overflow: "hidden" }}>
          {acceptedThreads.length === 0 ? (
            <p style={{ padding: "1rem", margin: 0, fontSize: 13, color: "#6b7280" }}>Accepted exchanges will appear here.</p>
          ) : acceptedThreads.map(item => (
            <button key={item.id} onClick={() => ensureAndOpen(item)} style={{ width: "100%", textAlign: "left", padding: "12px", background: selectedThreadId === item.id ? "#fffbeb" : "#fff", border: "none", borderBottom: "0.5px solid #f3f4f6", cursor: "pointer" }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.other?.username || "User"}</div>
              <div style={{ fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.listing.title}</div>
            </button>
          ))}
        </div>

        <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, minHeight: 560, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {!selectedThreadId ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontSize: 14 }}>Select a chat</div>
          ) : (
            <>
              <div style={{ padding: "12px 14px", borderBottom: "0.5px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{other?.username || "User"}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>{listing?.title || "Exchange chat"}</p>
                </div>
                <span style={{ fontSize: 11, color: blocked ? "#991b1b" : "#6b7280", background: blocked ? "#fee2e2" : "#f9fafb", borderRadius: 20, padding: "3px 8px" }}>{dailyCount}/{CHAT_DAILY_LIMIT} today</span>
              </div>
              <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 14, background: "#f9fafb" }}>
                {plainMessages.map(m => {
                  const mine = m.senderId === user.id;
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
                      <div style={{ maxWidth: "72%", background: mine ? "#d97706" : "#fff", color: mine ? "white" : "#111827", border: mine ? "none" : "0.5px solid #e5e7eb", borderRadius: 10, padding: "8px 10px" }}>
                        <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontStyle: m.deleted ? "italic" : "normal", opacity: m.deleted ? 0.8 : 1 }}>{m.plain}</p>
                        <p style={{ margin: "3px 0 0", fontSize: 10, opacity: 0.7 }}>{timeAgo(m.createdAt)}{m.editedAt && !m.deleted ? " · edited" : ""}</p>
                        {mine && !m.deleted && Date.now() - new Date(m.createdAt).getTime() <= CHAT_EDIT_WINDOW_MS && (
                          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                            <button onClick={() => { setEditing(m); setText(m.plain); }} style={{ background: "none", border: "none", color: mine ? "white" : "#d97706", padding: 0, fontSize: 11 }}>Edit</button>
                            <button onClick={() => deleteOwnMessage(m)} style={{ background: "none", border: "none", color: mine ? "white" : "#dc2626", padding: 0, fontSize: 11 }}>Delete</button>
                          </div>
                        )}
                        {!mine && !m.deleted && (
                          <button onClick={() => reportMessage(m)} style={{ marginTop: 4, background: "none", border: "none", color: "#dc2626", padding: 0, fontSize: 11 }}>Report</button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {otherIsTyping && (
                  <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
                    <div style={{ maxWidth: "72%", background: "#fff", color: "#6b7280", border: "0.5px solid #e5e7eb", borderRadius: 10, padding: "8px 10px", fontSize: 13, fontStyle: "italic" }}>
                      {other?.username || "User"} is typing...
                    </div>
                  </div>
                )}
              </div>
              <div style={{ padding: 12, borderTop: "0.5px solid #f3f4f6" }}>
                <Alert type="error" msg={err || (blocked ? "Daily chat limit reached. Messaging unlocks again tomorrow." : "")} onClose={() => setErr("")} />
                <form onSubmit={send} style={{ display: "flex", gap: 8 }}>
                  <input value={text} onChange={e => handleTyping(e.target.value)} disabled={blocked && !editing} placeholder={editing ? "Edit your message" : blocked ? "Messaging locked for today" : "Type an encrypted message"} style={{ flex: 1 }} />
                  {editing && <button type="button" onClick={() => { setEditing(null); setText(""); }} style={{ padding: "9px 12px", background: "#fff", color: "#374151", border: "0.5px solid #e5e7eb", borderRadius: 8 }}>Cancel</button>}
                  <button type="submit" disabled={sending || (blocked && !editing) || !text.trim()} style={{ padding: "9px 16px", background: "#d97706", color: "white", border: "none", borderRadius: 8, opacity: sending || blocked ? 0.6 : 1 }}>{editing ? "Save" : "Send"}</button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProfilePage({ user, onLogout }) {
  const [form, setForm] = useState({ oldPw: "", newPw: "", confirm: "" });
  const [err, setErr] = useState(""), [success, setSuccess] = useState(""), [loading, setLoading] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  if (!user) return null;
  async function changePw(e) {
    e.preventDefault();
    if (form.newPw !== form.confirm) { setErr("Passwords don't match"); return; }
    if (form.newPw.length < 6) { setErr("New password must be at least 6 characters"); return; }
    setErr(""); setLoading(true);
    try { await auth.changePassword(user.id, form.oldPw, form.newPw); setSuccess("Password updated!"); setForm({ oldPw: "", newPw: "", confirm: "" }); }
    catch (e) { setErr(e.message); } finally { setLoading(false); }
  }
  return (
    <div style={{ maxWidth: 480, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: 24, fontWeight: 500, fontFamily: "Georgia, serif", marginBottom: "1.5rem" }}>Profile</h1>
      <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "1.5rem", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#d97706", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 500, flexShrink: 0 }}>{user.username[0].toUpperCase()}</div>
          <div>
            <p style={{ margin: "0 0 2px", fontWeight: 500, fontSize: 16 }}>{user.username}</p>
            <p style={{ margin: "0 0 4px", fontSize: 13, color: "#6b7280" }}>{user.email}</p>
            <span style={{ fontSize: 11, background: user.role === "admin" ? "#d97706" : "#f9fafb", color: user.role === "admin" ? "white" : "#6b7280", padding: "2px 8px", borderRadius: 20 }}>{user.role}</span>
          </div>
        </div>
        <div style={{ marginBottom: 10, background: "#f9fafb", borderRadius: 8, padding: "8px 10px" }}>
          <p style={{ margin: "0 0 2px", fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0 }}>Encrypted public ID</p>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#374151" }}>{publicUserId(user)}</p>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>Member since {new Date(user.joined).toLocaleDateString()}</p>
      </div>
      <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "1.5rem", marginBottom: 14 }}>
        <button onClick={() => setShowSecurity(v => !v)} style={{ width: "100%", background: "none", border: "none", padding: 0, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>Security</h2>
          <span style={{ fontSize: 18, color: "#6b7280" }}>{showSecurity ? "-" : "+"}</span>
        </button>
        {showSecurity && (
          <div style={{ marginTop: 16 }}>
        <Alert type="error" msg={err} onClose={() => setErr("")} />
        <Alert type="success" msg={success} onClose={() => setSuccess("")} />
        <form onSubmit={changePw}>
          {[{ k: "oldPw", l: "Current password" }, { k: "newPw", l: "New password" }, { k: "confirm", l: "Confirm new password" }].map(f => (
            <div key={f.k} style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, color: "#6b7280", display: "block", marginBottom: 4 }}>{f.l}</label>
              <input type="password" value={form[f.k]} onChange={e => setForm(p => ({ ...p, [f.k]: e.target.value }))} required style={{ width: "100%", boxSizing: "border-box" }} />
            </div>
          ))}
          <button type="submit" disabled={loading} style={{ padding: "8px 18px", background: "#d97706", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 14, opacity: loading ? 0.7 : 1 }}>{loading ? "Updating…" : "Update password"}</button>
        </form>
          </div>
        )}
      </div>
      <button onClick={onLogout} style={{ width: "100%", padding: "11px", background: "#fee2e2", color: "#991b1b", border: "0.5px solid #fca5a5", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 500 }}>Sign out</button>
    </div>
  );
}

function NotificationsPage({ user, notifications, onNavigate, onRefresh }) {
  if (!user) return <div style={{ textAlign: "center", padding: "4rem" }}><button onClick={() => onNavigate("login")} style={{ color: "#0969da", background: "none", border: "none" }}>Sign in to view notifications</button></div>;
  const groups = groupNotifications(notifications);
  async function markOne(id) {
    await notificationDb.markRead(id);
    await onRefresh();
  }
  async function markAll() {
    await notificationDb.markAllRead(user.id);
    await onRefresh();
  }
  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <h1>Notifications</h1>
          <p>Updates from offers, moderation, reports, and account activity.</p>
        </div>
        <button className="btn-secondary" onClick={markAll}>Mark all read</button>
      </div>
      <div className="github-panel">
        {Object.entries(groups).map(([label, items]) => (
          <section key={label} className="notification-group">
            <h2>{label}</h2>
            {items.length === 0 ? (
              <p className="empty-note">No notifications.</p>
            ) : items.map(n => (
              <div key={n.id} className={`notification-row ${n.read ? "" : "is-unread"}`}>
                <div>
                  <strong>{n.title || n.type || "Notification"}</strong>
                  <p>{n.message || "No details provided."}</p>
                  <span>{timeAgo(n.createdAt)}</span>
                </div>
                {!n.read && <button className="btn-link" onClick={() => markOne(n.id)}>Mark read</button>}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

// ── Analytics Admin Section ───────────────────────────────────────────────────

function AnalyticsPage({ users }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("24h");

  useEffect(() => {
    analyticsDb.getRecent(500).then(data => { setEvents(data); setLoading(false); });
  }, []);

  const now = Date.now();
  const ranges = { "1h": 3600000, "24h": 86400000, "7d": 604800000, "30d": 2592000000, all: Infinity };
  const filtered = events.filter(e => {
    const t = e.localTime ? new Date(e.localTime).getTime() : 0;
    return now - t <= (ranges[timeRange] || Infinity);
  });

  // Aggregations
  const byType = {};
  const byPage = {};
  const byCTA = {};
  const byCountry = {};
  const byHour = Array(24).fill(0);
  const guestIps = new Set();

  filtered.forEach(e => {
    byType[e.type] = (byType[e.type] || 0) + 1;
    if (e.actorType === "guest" && e.guestIp) guestIps.add(e.guestIp);
    if (e.page) byPage[e.page] = (byPage[e.page] || 0) + 1;
    if (e.type === "cta_click" && e.label) byCTA[e.label] = (byCTA[e.label] || 0) + 1;
    if (e.location?.country) byCountry[e.location.country] = (byCountry[e.location.country] || 0) + 1;
    if (e.localTime) byHour[new Date(e.localTime).getHours()]++;
  });

  const topCTAs = Object.entries(byCTA).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topPages = Object.entries(byPage).sort((a, b) => b[1] - a[1]);
  const topCountries = Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxHour = Math.max(...byHour, 1);
  const recentEvents = filtered.slice(0, 50);

  const statCards = [
    { label: "Page Views",      value: byType.page_view || 0,       icon: "👁️", color: "#3b82f6" },
    { label: "CTA Clicks",      value: byType.cta_click || 0,        icon: "🖱️", color: "#d97706" },
    { label: "Offers Submitted",value: byType.offer_submitted || 0,  icon: "🤝", color: "#8b5cf6" },
    { label: "Items Posted",    value: byType.listing_posted || 0,   icon: "📦", color: "#10b981" },
    { label: "Logins",          value: byType.login || 0,            icon: "🔑", color: "#f59e0b" },
    { label: "Registrations",   value: byType.register || 0,         icon: "👤", color: "#ec4899" },
    { label: "Guest IPs",        value: guestIps.size,                icon: "Guest", color: "#111827" },
  ];

  if (loading) return <Spinner />;

  return (
    <div style={{ maxWidth: 1000, margin: "2rem auto", padding: "0 1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, fontFamily: "Georgia, serif" }}>📊 Analytics</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {["1h", "24h", "7d", "30d", "all"].map(r => (
            <button key={r} onClick={() => setTimeRange(r)}
              style={{ padding: "5px 12px", border: "none", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 500,
                background: timeRange === r ? "#d97706" : "#f3f4f6", color: timeRange === r ? "white" : "#374151" }}>
              {r === "all" ? "All time" : r}
            </button>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10, marginBottom: 20 }}>
        {statCards.map(s => (
          <div key={s.label} style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 26, fontWeight: 600, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Activity by Hour */}
        <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 10, padding: "1rem" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 500, color: "#374151" }}>⏰ Activity by hour of day</h3>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80 }}>
            {byHour.map((v, h) => (
              <div key={h} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ width: "100%", background: "#d97706", borderRadius: "2px 2px 0 0", height: `${(v / maxHour) * 68}px`, minHeight: v > 0 ? 2 : 0, opacity: 0.8 }} title={`${h}:00 — ${v} events`} />
                {h % 6 === 0 && <span style={{ fontSize: 8, color: "#9ca3af" }}>{h}h</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Top Countries */}
        <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 10, padding: "1rem" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 500, color: "#374151" }}>🌍 Top locations</h3>
          {topCountries.length === 0
            ? <p style={{ fontSize: 12, color: "#9ca3af" }}>No location data yet</p>
            : topCountries.map(([country, count]) => (
              <div key={country} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "#374151" }}>{country}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 60, height: 4, background: "#f3f4f6", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${(count / (topCountries[0]?.[1] || 1)) * 100}%`, height: "100%", background: "#d97706", borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 11, color: "#6b7280", minWidth: 20, textAlign: "right" }}>{count}</span>
                </div>
              </div>
            ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        {/* Top CTAs */}
        <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 10, padding: "1rem" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 500, color: "#374151" }}>🖱️ Top CTA clicks</h3>
          {topCTAs.length === 0
            ? <p style={{ fontSize: 12, color: "#9ca3af" }}>No CTA data yet</p>
            : topCTAs.map(([label, count]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7, gap: 8 }}>
                <span style={{ fontSize: 11, color: "#374151", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label.replace(/_/g, " ")}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 50, height: 4, background: "#f3f4f6", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${(count / (topCTAs[0]?.[1] || 1)) * 100}%`, height: "100%", background: "#8b5cf6", borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 11, color: "#6b7280", minWidth: 20, textAlign: "right" }}>{count}</span>
                </div>
              </div>
            ))}
        </div>

        {/* Pages */}
        <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 10, padding: "1rem" }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 500, color: "#374151" }}>📄 Page views</h3>
          {topPages.length === 0
            ? <p style={{ fontSize: 12, color: "#9ca3af" }}>No page view data yet</p>
            : topPages.map(([page, count]) => (
              <div key={page} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                <span style={{ fontSize: 12, color: "#374151" }}>{page}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 60, height: 4, background: "#f3f4f6", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${(count / (topPages[0]?.[1] || 1)) * 100}%`, height: "100%", background: "#3b82f6", borderRadius: 2 }} />
                  </div>
                  <span style={{ fontSize: 11, color: "#6b7280", minWidth: 20, textAlign: "right" }}>{count}</span>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Recent Events Log */}
      <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 10, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "0.5px solid #f3f4f6" }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#374151" }}>🔴 Live event log (last 50)</h3>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9fafb" }}>
                {["Type", "Label", "Page", "User / Guest", "Location", "Time"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 500, color: "#6b7280", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentEvents.length === 0
                ? <tr><td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "#9ca3af" }}>No events in this time range</td></tr>
                : recentEvents.map(e => {
                    const u = users.find(x => x.id === e.userId);
                    const typeColors = { page_view: "#3b82f6", cta_click: "#d97706", offer_submitted: "#8b5cf6", listing_posted: "#10b981", login: "#f59e0b", register: "#ec4899" };
                    return (
                      <tr key={e.id} style={{ borderTop: "0.5px solid #f9fafb" }}>
                        <td style={{ padding: "7px 12px" }}>
                          <span style={{ background: typeColors[e.type] ? typeColors[e.type] + "22" : "#f3f4f6", color: typeColors[e.type] || "#374151", padding: "2px 6px", borderRadius: 4, fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" }}>
                            {e.type?.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td style={{ padding: "7px 12px", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }}>{e.label || "—"}</td>
                        <td style={{ padding: "7px 12px", color: "#6b7280" }}>{e.page || "—"}</td>
                        <td style={{ padding: "7px 12px", color: "#6b7280" }}>{u ? u.username : (e.userId ? "deleted" : `guest${e.guestIp ? ` · ${e.guestIp}` : ""}`)}</td>
                        <td style={{ padding: "7px 12px", color: "#6b7280", whiteSpace: "nowrap" }}>
                          {e.location?.city ? `${e.location.city}, ${e.location.countryCode || e.location.country}` : "—"}
                        </td>
                        <td style={{ padding: "7px 12px", color: "#9ca3af", whiteSpace: "nowrap" }}>{e.localTime ? timeAgo(e.localTime) : "—"}</td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Admin Page ────────────────────────────────────────────────────────────────

function AdminPage({ user, listings, exchanges, users, reports, ratings, appeals, notifications, appConfig, onConfigChange, onRefresh, onNavigate }) {
  const [tab, setTab] = useState("analytics");
  if (!user || user.role !== "admin") return <div style={{ textAlign: "center", padding: "4rem" }}>Access denied. Admin only.</div>;

  async function toggleUser(id) {
    const target = users.find(u => u.id === id); if (!target) return;
    await userDb.update(id, { active: !target.active }); onRefresh();
  }
  async function toggleUserChat(id) {
    const target = users.find(u => u.id === id); if (!target) return;
    await userDb.update(id, { chatDisabled: target.chatDisabled !== true });
    onRefresh();
  }
  async function deleteUser(id) {
    if (!confirm("Delete user and all their listings?")) return;
    await userDb.delete(id); await listingDb.deleteByUser(id); onRefresh();
  }
  async function deleteListing(id) { if (!confirm("Delete this listing?")) return; await listingDb.delete(id); onRefresh(); }
  async function deleteExchange(id) { await exchangeDb.delete(id); onRefresh(); }
  async function resolveReport(id) { await reportDb.update(id, { status: "resolved", resolvedBy: user.id }); onRefresh(); }
  async function sendReportFeedback(report) {
    const feedback = prompt("Feedback to send to the reporter");
    if (!feedback?.trim()) return;
    await reportDb.update(report.id, {
      adminFeedback: feedback.trim(),
      feedbackBy: user.id,
      feedbackAt: new Date().toISOString(),
      status: report.status === "open" ? "reviewed" : report.status,
    });
    if (report.reporterId) {
      await notificationDb.create({
        userId: report.reporterId,
        type: "report_feedback",
        title: "Report reviewed",
        message: feedback.trim(),
        reportId: report.id,
      });
    }
    onRefresh();
  }
  async function suspendFromReport(report) {
    if (!report.reportedUserId) return;
    await userDb.update(report.reportedUserId, { active: false, suspendedAt: new Date().toISOString(), suspensionReason: report.reason || "report" });
    await reportDb.update(report.id, { status: "actioned", action: "user_suspended", resolvedBy: user.id });
    onRefresh();
  }
  async function removeReportedListing(report) {
    if (!report.listingId) return;
    await listingDb.delete(report.listingId);
    await reportDb.update(report.id, { status: "actioned", action: "listing_removed", resolvedBy: user.id });
    onRefresh();
  }
  async function decideAppeal(appeal, approved) {
    if (approved && appeal.userId) await userDb.update(appeal.userId, { active: true, appealApprovedAt: new Date().toISOString() });
    await appealDb.update(appeal.id, { status: approved ? "approved" : "declined", reviewedBy: user.id });
    onRefresh();
  }
  async function toggleChatFeature() {
    const next = appConfig.chatEnabled === false;
    const patch = { ...appConfig, chatEnabled: next };
    await appConfigDb.update({ chatEnabled: next });
    onConfigChange(patch);
  }

  const stats = [
    { l: "Total users",    v: users.length },
    { l: "Total listings", v: listings.length },
    { l: "Available",      v: listings.filter(l => l.status === "available").length },
    { l: "Exchanges done", v: exchanges.filter(e => e.status === "accepted").length },
    { l: "Notifications",  v: notifications.length },
  ];

  const TabBtn = ({ id, l }) => (
    <button onClick={() => setTab(id)} style={{ padding: "8px 16px", border: "none", cursor: "pointer", fontSize: 13, background: tab === id ? "#d97706" : "#f3f4f6", color: tab === id ? "white" : "#374151", borderRadius: 8 }}>{l}</button>
  );

  return (
    <div style={{ maxWidth: 1000, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: 24, fontWeight: 500, fontFamily: "Georgia, serif", marginBottom: "1.5rem" }}>Admin dashboard</h1>
      <div className="admin-stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 20 }}>
        {stats.map(s => (
          <div key={s.l} style={{ background: "#f9fafb", borderRadius: 8, padding: "1rem", textAlign: "center" }}>
            <p style={{ margin: "0 0 4px", fontSize: 12, color: "#6b7280" }}>{s.l}</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 500 }}>{s.v}</p>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <TabBtn id="analytics" l="📊 Analytics" />
        <TabBtn id="users"     l="👥 Users" />
        <TabBtn id="listings"  l="📦 Listings" />
        <TabBtn id="exchanges" l="🤝 Exchanges" />
        <TabBtn id="moderation" l="Moderation" />
        <TabBtn id="notifications" l="Notifications" />
        <TabBtn id="features" l="Features" />
      </div>

      {tab === "analytics" && <AnalyticsPage users={users} />}

      {tab === "moderation" && (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "1rem" }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 500 }}>Reports ({reports.filter(r => r.status !== "resolved").length})</h2>
            {reports.length === 0 ? <p style={{ color: "#6b7280", fontSize: 13 }}>No reports yet.</p> : reports.map(report => {
              const reporter = users.find(u => u.id === report.reporterId);
              const reported = users.find(u => u.id === report.reportedUserId);
              return (
                <div key={report.id} style={{ borderTop: "0.5px solid #f3f4f6", padding: "12px 0" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 500 }}>{report.type} report · {report.reason} · {report.status}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Reporter: {reporter?.username || "Unknown"} · Reported: {reported?.username || "Unknown"} · {timeAgo(report.createdAt)}</p>
                  <p style={{ margin: "8px 0", fontSize: 13, color: "#374151" }}>{report.details}</p>
                  {report.listingTitle && <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b7280" }}>Listing: {report.listingTitle}</p>}
                  {report.messageText && <p style={{ margin: "0 0 8px", fontSize: 12, color: "#991b1b" }}>Reported message: {report.messageText}</p>}
                  {report.adminFeedback && <p style={{ margin: "0 0 8px", fontSize: 12, color: "#065f46" }}>Admin feedback: {report.adminFeedback}</p>}
                  {Array.isArray(report.conversationSnapshot) && (
                    <div style={{ background: "#f9fafb", borderRadius: 8, padding: 10, marginBottom: 8, maxHeight: 220, overflow: "auto" }}>
                      {report.conversationSnapshot.map((m, i) => <p key={i} style={{ margin: "0 0 6px", fontSize: 12, color: "#374151" }}><strong>{m.senderName}:</strong> {m.text}</p>)}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {report.listingId && <button onClick={() => removeReportedListing(report)} style={{ padding: "5px 10px", background: "#fee2e2", border: "0.5px solid #fca5a5", color: "#991b1b", borderRadius: 8, fontSize: 12 }}>Remove post</button>}
                    {report.reportedUserId && <button onClick={() => suspendFromReport(report)} style={{ padding: "5px 10px", background: "#111827", color: "white", border: "none", borderRadius: 8, fontSize: 12 }}>Suspend user</button>}
                    <button onClick={() => sendReportFeedback(report)} style={{ padding: "5px 10px", background: "#eff6ff", border: "0.5px solid #bfdbfe", color: "#2563eb", borderRadius: 8, fontSize: 12 }}>Send feedback</button>
                    <button onClick={() => resolveReport(report.id)} style={{ padding: "5px 10px", background: "#f9fafb", border: "0.5px solid #e5e7eb", borderRadius: 8, fontSize: 12 }}>Mark resolved</button>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "1rem" }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 500 }}>Appeals ({appeals.filter(a => a.status === "open").length})</h2>
            {appeals.length === 0 ? <p style={{ color: "#6b7280", fontSize: 13 }}>No appeals yet.</p> : appeals.map(appeal => (
              <div key={appeal.id} style={{ borderTop: "0.5px solid #f3f4f6", padding: "12px 0" }}>
                <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 500 }}>{appeal.username} · {appeal.email} · {appeal.status}</p>
                <p style={{ margin: "0 0 8px", fontSize: 13, color: "#374151" }}>{appeal.message}</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => decideAppeal(appeal, true)} style={{ padding: "5px 10px", background: "#d1fae5", border: "0.5px solid #86efac", color: "#065f46", borderRadius: 8, fontSize: 12 }}>Approve</button>
                  <button onClick={() => decideAppeal(appeal, false)} style={{ padding: "5px 10px", background: "#fee2e2", border: "0.5px solid #fca5a5", color: "#991b1b", borderRadius: 8, fontSize: 12 }}>Decline</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "1rem" }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 500 }}>Genuine user ratings</h2>
            {users.map(u => {
              const score = avgRating(ratings.filter(r => r.targetUserId === u.id), r => r.userRating);
              return <p key={u.id} style={{ margin: "0 0 6px", fontSize: 13 }}>{u.username}: {score ? `${score.toFixed(1)} / 5` : "not rated"}</p>;
            })}
          </div>
        </div>
      )}

      {tab === "notifications" && (
        <div className="github-panel">
          {Object.entries(groupNotifications(notifications)).map(([label, items]) => (
            <section key={label} className="notification-group">
              <h2>{label}</h2>
              {items.length === 0 ? <p className="empty-note">No notifications.</p> : items.map(n => {
                const recipient = users.find(u => u.id === n.userId);
                return (
                  <div key={n.id} className={`notification-row ${n.read ? "" : "is-unread"}`}>
                    <div>
                      <strong>{n.title || n.type || "Notification"}</strong>
                      <p>{n.message || "No details provided."}</p>
                      <span>{recipient?.username || "Unknown user"} · {timeAgo(n.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}

      {tab === "features" && (
        <div className="github-panel" style={{ padding: 16 }}>
          <div className="feature-toggle-row">
            <div>
              <h2>Global chat feature</h2>
              <p>Master switch for chats. For individual users, use the Chat column in the Users tab.</p>
            </div>
            <button className={appConfig.chatEnabled === false ? "btn-secondary" : "btn-primary"} onClick={toggleChatFeature}>
              {appConfig.chatEnabled === false ? "Enable chat" : "Disable chat"}
            </button>
          </div>
        </div>
      )}

      {tab !== "analytics" && tab !== "moderation" && tab !== "notifications" && tab !== "features" && (
        <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, overflow: "auto" }}>
          {tab === "users" && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: "#f9fafb" }}>{["User","Email","Public ID","User ID","Role","Joined","Status","Chat","Actions"].map(h => <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500, color: "#6b7280", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
              <tbody>{users.map(u => (
                <tr key={u.id} style={{ borderTop: "0.5px solid #f9fafb" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{u.username}</td>
                  <td style={{ padding: "10px 12px", color: "#6b7280" }}>{u.email}</td>
                  <td style={{ padding: "10px 12px", color: "#6b7280", fontFamily: "monospace" }}>{publicUserId(u)}</td>
                  <td style={{ padding: "10px 12px", color: "#6b7280", fontFamily: "monospace", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{u.id}</td>
                  <td style={{ padding: "10px 12px" }}><span style={{ fontSize: 11, background: u.role === "admin" ? "#d97706" : "#f9fafb", color: u.role === "admin" ? "white" : "#6b7280", padding: "2px 8px", borderRadius: 20 }}>{u.role}</span></td>
                  <td style={{ padding: "10px 12px", color: "#6b7280" }}>{new Date(u.joined).toLocaleDateString()}</td>
                  <td style={{ padding: "10px 12px" }}><span style={{ fontSize: 11, background: u.active ? "#d1fae5" : "#fee2e2", color: u.active ? "#065f46" : "#991b1b", padding: "2px 8px", borderRadius: 20 }}>{u.active ? "Active" : "Suspended"}</span></td>
                  <td style={{ padding: "10px 12px" }}><span style={{ fontSize: 11, background: u.chatDisabled ? "#fee2e2" : "#d1fae5", color: u.chatDisabled ? "#991b1b" : "#065f46", padding: "2px 8px", borderRadius: 20 }}>{u.chatDisabled ? "Off" : "On"}</span></td>
                  <td style={{ padding: "10px 12px" }}>
                    {u.id !== user.id && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => toggleUser(u.id)} style={{ padding: "4px 8px", fontSize: 11, borderRadius: 6, border: "0.5px solid #e5e7eb", cursor: "pointer", background: "#f9fafb", whiteSpace: "nowrap" }}>{u.active ? "Suspend" : "Restore"}</button>
                        <button onClick={() => toggleUserChat(u.id)} style={{ padding: "4px 8px", fontSize: 11, borderRadius: 6, border: "0.5px solid #e5e7eb", cursor: "pointer", background: "#f9fafb", whiteSpace: "nowrap" }}>{u.chatDisabled ? "Chat on" : "Chat off"}</button>
                        <button onClick={() => deleteUser(u.id)} style={{ padding: "4px 8px", fontSize: 11, borderRadius: 6, border: "0.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b", cursor: "pointer" }}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {tab === "listings" && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: "#f9fafb" }}>{["Title","Owner","Category","Status","Posted","Action"].map(h => <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500, color: "#6b7280" }}>{h}</th>)}</tr></thead>
              <tbody>{listings.map(l => { const o = users.find(u => u.id === l.userId); return (
                <tr key={l.id} style={{ borderTop: "0.5px solid #f9fafb" }}>
                  <td style={{ padding: "10px 12px" }}><button onClick={() => onNavigate("item", l.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#d97706", fontSize: 13, padding: 0 }}>{l.title}</button></td>
                  <td style={{ padding: "10px 12px", color: "#6b7280" }}>{o?.username}</td>
                  <td style={{ padding: "10px 12px", color: "#6b7280" }}>{l.category}</td>
                  <td style={{ padding: "10px 12px" }}><Badge status={l.status} /></td>
                  <td style={{ padding: "10px 12px", color: "#6b7280", whiteSpace: "nowrap" }}>{timeAgo(l.createdAt)}</td>
                  <td style={{ padding: "10px 12px" }}><button onClick={() => deleteListing(l.id)} style={{ padding: "4px 8px", fontSize: 11, borderRadius: 6, border: "0.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b", cursor: "pointer" }}>Delete</button></td>
                </tr>
              );})}
              </tbody>
            </table>
          )}
          {tab === "exchanges" && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: "#f9fafb" }}>{["Offer","For listing","By user","Status","Date","Action"].map(h => <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500, color: "#6b7280" }}>{h}</th>)}</tr></thead>
              <tbody>{exchanges.map(ex => { const l = listings.find(x => x.id === ex.listingId), o = users.find(u => u.id === ex.offererId); return (
                <tr key={ex.id} style={{ borderTop: "0.5px solid #f9fafb" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{ex.offerTitle}</td>
                  <td style={{ padding: "10px 12px", color: "#6b7280" }}>{l?.title || "Deleted"}</td>
                  <td style={{ padding: "10px 12px", color: "#6b7280" }}>{o?.username}</td>
                  <td style={{ padding: "10px 12px" }}><Badge status={ex.status} /></td>
                  <td style={{ padding: "10px 12px", color: "#6b7280", whiteSpace: "nowrap" }}>{timeAgo(ex.createdAt)}</td>
                  <td style={{ padding: "10px 12px" }}><button onClick={() => deleteExchange(ex.id)} style={{ padding: "4px 8px", fontSize: 11, borderRadius: 6, border: "0.5px solid #fca5a5", background: "#fee2e2", color: "#991b1b", cursor: "pointer" }}>Delete</button></td>
                </tr>
              );})}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────

function Navbar({ user, page, appConfig, onNavigate, onLogout }) {
  const navItems = [
    { id: "browse", l: "Browse" },
      ...(user ? [
      { id: "post", l: "Post item" },
      { id: "my-listings", l: "My listings" },
      { id: "my-exchanges", l: "Exchanges" },
      ...(canUseChat(user, appConfig) ? [{ id: "chats", l: "Chats" }] : []),
      { id: "notifications", l: "Notifications" },
      { id: "settings", l: "Settings" },
      ...(user.role === "admin" ? [{ id: "admin", l: "Admin ★" }] : []),
    ] : []),
  ];
  return (
    <nav className="app-nav" style={{ background: "#fff", borderBottom: "0.5px solid #f3f4f6", padding: "0 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52, position: "sticky", top: 0, zIndex: 100 }}>
      <button className="brand-mark" onClick={() => onNavigate("home")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
        <span>BH</span>
        <strong>BarterHub</strong>
      </button>
      <div className="nav-links" style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        {navItems.map(n => (
          <button key={n.id} onClick={() => { trackCTA(`nav_${n.id}`, page, user?.id); onNavigate(n.id); }}
            className={page === n.id ? "nav-item-active" : ""}
            style={{ padding: "6px 10px", background: page === n.id ? "#f9fafb" : "none", border: "none", cursor: "pointer", fontSize: 13, borderRadius: 8, color: n.id === "admin" ? "#d97706" : "#111827", fontWeight: n.id === "admin" ? 500 : 400 }}>
            {n.l}
          </button>
        ))}
        {user
          ? <button onClick={() => onNavigate("profile")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "none", border: "0.5px solid #e5e7eb", borderRadius: 20, cursor: "pointer", fontSize: 13, marginLeft: 4 }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#d97706", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>{user.username[0].toUpperCase()}</span>
              <span>{user.username}</span>
            </button>
          : <div className="nav-auth-actions" style={{ display: "flex", gap: 6, marginLeft: 4 }}>
              <button className="nav-auth-secondary" onClick={() => { trackCTA("nav_sign_in", page); onNavigate("login"); }} style={{ padding: "6px 14px", background: "none", border: "0.5px solid #e5e7eb", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>Sign in</button>
              <button className="nav-auth-primary" onClick={() => { trackCTA("nav_register", page); onNavigate("register"); }} style={{ padding: "6px 14px", background: "#d97706", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>Register</button>
            </div>}
      </div>
    </nav>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("home");
  const [pageParam, setPageParam] = useState(null);
  const [listings, setListings] = useState([]);
  const [exchanges, setExchanges] = useState([]);
  const [reports, setReports] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [appConfig, setAppConfig] = useState({ chatEnabled: true });
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("bh_dark_mode") === "true");

  async function loadAll() {
    const [u, l, e, r, rate, a, n, cfg] = await Promise.all([userDb.getAll(), listingDb.getAll(), exchangeDb.getAll(), reportDb.getAll(), ratingDb.getAll(), appealDb.getAll(), notificationDb.getAll(), appConfigDb.get()]);
    setUsers(u); setListings(l); setExchanges(e); setReports(r); setRatings(rate); setAppeals(a); setNotifications(n); setAppConfig(cfg);
  }

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    localStorage.setItem("bh_dark_mode", String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    async function init(){
  try {
    console.log("1. starting...");
    await auth.seedAdmin();
    await userDb.ensureUserNumbers();
    console.log("2. seedAdmin done");
    const me = await auth.me();
    if (me) setUser(me);
    console.log("3. auth.me done", me);
    await loadAll();
    console.log("4. loadAll done");
  } catch(e) {
    console.error("Init failed:", e);
  } finally {
    setLoading(false);
  }

    }
    init();
  }, []);

  // Track page views automatically
  useEffect(() => {
    if (!loading) {
      trackPageView(page, user?.id);
    }
  }, [page, loading]);

  function navigate(p, param = null) { setPage(p); setPageParam(param); }

  async function handleLogin(u) { setUser(u); await loadAll(); navigate("home"); }
  async function handleLogout() { await auth.logout(); setUser(null); navigate("home"); }

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Spinner />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: darkMode ? "#111827" : "var(--brand-teal)" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <Navbar user={user} page={page} appConfig={appConfig} onNavigate={navigate} onLogout={handleLogout} />
      <main>
        {page === "home"         && <HomePage onNavigate={navigate} listings={listings} users={users} currentUser={user} appConfig={appConfig} onUserUpdate={setUser} />}
        {page === "browse"       && <BrowsePage listings={listings} users={users} onNavigate={navigate} currentUser={user} />}
        {page === "post"         && <PostItemPage user={user} onPosted={loadAll} onNavigate={navigate} />}
        {page === "item"         && <ItemDetailPage listingId={pageParam} listings={listings} users={users} exchanges={exchanges} ratings={ratings} user={user} appConfig={appConfig} onNavigate={navigate} onRefresh={loadAll} onReportCreated={loadAll} />}
        {page === "my-listings"  && <MyListingsPage user={user} listings={listings} exchanges={exchanges} onNavigate={navigate} onRefresh={loadAll} />}
        {page === "my-exchanges" && <MyExchangesPage user={user} listings={listings} exchanges={exchanges} users={users} ratings={ratings} appConfig={appConfig} onNavigate={navigate} onRated={loadAll} />}
        {page === "chats"        && <ChatsPage user={user} listings={listings} exchanges={exchanges} users={users} selectedThreadId={null} appConfig={appConfig} onNavigate={navigate} onUserUpdate={setUser} />}
        {page === "chat"         && <ChatsPage user={user} listings={listings} exchanges={exchanges} users={users} selectedThreadId={pageParam} appConfig={appConfig} onNavigate={navigate} onUserUpdate={setUser} />}
        {page === "notifications" && <NotificationsPage user={user} notifications={notifications.filter(n => n.userId === user?.id)} onNavigate={navigate} onRefresh={loadAll} />}
        {page === "settings"     && <SettingsPage darkMode={darkMode} onDarkModeChange={setDarkMode} />}
        {page === "profile"      && <ProfilePage user={user} onLogout={handleLogout} />}
        {page === "admin"        && <AdminPage user={user} listings={listings} exchanges={exchanges} users={users} reports={reports} ratings={ratings} appeals={appeals} notifications={notifications} appConfig={appConfig} onConfigChange={setAppConfig} onRefresh={loadAll} onNavigate={navigate} />}
        {page === "login"        && <LoginPage onLogin={handleLogin} onNavigate={navigate} />}
        {page === "register"     && <RegisterPage onLogin={handleLogin} onNavigate={navigate} />}
        {page === "reset-password" && <ResetPasswordPage onNavigate={navigate} />}
        {page === "appeal"       && <AppealPage onNavigate={navigate} />}
      </main>
    </div>
  );
}
