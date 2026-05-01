import { useState, useEffect, useRef, useCallback } from "react";
import { auth } from "./auth";
import { userDb, listingDb, exchangeDb, analyticsDb, notificationDb } from "./database";
import { trackPageView, trackCTA, trackEvent } from "./analytics";

const CATEGORIES = ["Electronics","Clothing","Books","Tools","Furniture","Food","Art","Sports","Vehicles","Other"];

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`; if (h > 0) return `${h}h ago`; if (m > 0) return `${m}m ago`; return "just now";
}

function userNumber(user) {
  return user?.userNumber || "----";
}

function RedDot({ show }) {
  if (!show) return null;
  return <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#dc2626", display: "inline-block", boxShadow: "0 0 0 2px #fff" }} />;
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(file);
  });
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
      onClick={() => { trackCTA(`listing_card_${listing.title}`, page, currentUser?.id); onClick(listing); }}
      style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, overflow: "hidden", cursor: "pointer", transition: "border-color 0.15s, transform 0.15s, box-shadow 0.15s" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#d1d5db"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#f3f4f6"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ height: 180, overflow: "hidden", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {listing.imageBase64
          ? <img src={listing.imageBase64} alt={listing.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: 48, color: "#9ca3af" }}>📦</span>}
      </div>
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 500, flex: 1, lineHeight: 1.3 }}>{listing.title}</h3>
          <Badge status={listing.status} />
        </div>
        <p style={{ margin: "0 0 8px", fontSize: 13, color: "#6b7280", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{listing.description}</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: "#9ca3af" }}>{owner?.username || "Unknown"} · {timeAgo(listing.createdAt)}</span>
          <span style={{ fontSize: 11, background: "#f9fafb", padding: "2px 8px", borderRadius: 20, color: "#6b7280" }}>{listing.category}</span>
        </div>
        <div style={{ fontSize: 12, color: "#d97706", fontStyle: "italic", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>Wants: {listing.wantInReturn}</div>
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
      trackEvent({ type: "login", label: "login_success", page: "login", userId: user.id, extra: { userNumber: user.userNumber || null } });
      onLogin(user);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }
  return (
    <div style={{ maxWidth: 400, margin: "4rem auto", padding: "0 1rem" }}>
      <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "2rem" }}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <span style={{ fontSize: 32 }}>⚖️</span>
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
      trackEvent({ type: "register", label: "register_success", page: "register", userId: user.id, extra: { userNumber: user.userNumber || null } });
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
          <span style={{ fontSize: 32 }}>⚖️</span>
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

function HomePage({ onNavigate, listings, users, currentUser }) {
  const featured = listings.filter(l => l.status === "available").slice(0, 6);
  return (
    <div>
      <div style={{ background: "linear-gradient(135deg,#78350f 0%,#d97706 100%)", padding: "4rem 2rem", textAlign: "center", color: "white" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⚖️</div>
        <h1 style={{ margin: "0 0 1rem", fontSize: 34, fontWeight: 500, fontFamily: "Georgia, serif", lineHeight: 1.3 }}>Trade What You Have.<br />Get What You Need.</h1>
        <p style={{ margin: "0 0 2rem", fontSize: 15, opacity: 0.9, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>A community marketplace for bartering goods — no money needed.</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => { trackCTA("hero_browse_listings", "home", currentUser?.id); onNavigate("browse"); }}
            style={{ padding: "11px 28px", background: "white", color: "#92400e", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 15, fontWeight: 500 }}>
            Browse listings
          </button>
          <button onClick={() => { trackCTA("hero_post_item", "home", currentUser?.id); onNavigate("post"); }}
            style={{ padding: "11px 28px", background: "transparent", color: "white", border: "1.5px solid rgba(255,255,255,0.7)", borderRadius: 8, cursor: "pointer", fontSize: 15, fontWeight: 500 }}>
            Post an item
          </button>
        </div>
      </div>

      <div style={{ padding: "3rem 2rem", maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", marginBottom: "2rem", fontSize: 20, fontWeight: 500, fontFamily: "Georgia, serif" }}>How it works</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 20 }}>
          {[
            { icon: "📸", title: "Post your item",  desc: "List what you have with a photo and description" },
            { icon: "🔍", title: "Browse offers",   desc: "Find items you want from the community" },
            { icon: "🤝", title: "Make an offer",   desc: "Propose what you'll give in return" },
            { icon: "✅", title: "Swap!",           desc: "Meet and exchange your items" },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: "center", padding: "1.5rem 1rem", background: "#f9fafb", borderRadius: 12 }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>{s.icon}</div>
              <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 500 }}>{s.title}</h3>
              <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {featured.length > 0 && (
        <div style={{ padding: "0 2rem 3rem", maxWidth: 900, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 500, fontFamily: "Georgia, serif" }}>Recent listings</h2>
            <button onClick={() => { trackCTA("home_see_all", "home", currentUser?.id); onNavigate("browse"); }}
              style={{ background: "none", border: "none", color: "#d97706", cursor: "pointer", fontSize: 14 }}>See all →</button>
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
      trackEvent({ type: "listing_posted", label: form.title, page: "post", userId: user.id, extra: { userNumber: user.userNumber || null, listingTitle: form.title } });
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

function ItemDetailPage({ listingId, listings, users, exchanges, user, onNavigate, onRefresh }) {
  const listing = listings.find(l => l.id === listingId);
  const [offerForm, setOfferForm] = useState({ title: "", description: "" });
  const [offerImage, setOfferImage] = useState(null);
  const [err, setErr] = useState(""), [success, setSuccess] = useState(""), [loading, setLoading] = useState(false), [showOffer, setShowOffer] = useState(false);
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
      const exchange = await exchangeDb.create({
        listingId: listing.id,
        listingTitle: listing.title,
        ownerId: listing.userId,
        offererId: user.id,
        offererNumber: user.userNumber || null,
        offerTitle: offerForm.title,
        offerDescription: offerForm.description,
        offerImage: offerImage || null,
        status: "pending"
      });
      await listingDb.update(listing.id, { status: "pending" });
      await notificationDb.create({
        userId: listing.userId,
        actorId: user.id,
        actorNumber: user.userNumber || null,
        type: "offer_received",
        title: "New offer received",
        message: `${user.username} offered ${offerForm.title} for ${listing.title}`,
        listingId: listing.id,
        exchangeId: exchange.id,
      });
      trackEvent({ type: "offer_submitted", label: offerForm.title, page: "item", userId: user.id, extra: { userNumber: user.userNumber, listingId: listing.id, listingTitle: listing.title, exchangeId: exchange.id } });
      setSuccess("Offer submitted!"); setShowOffer(false); setOfferForm({ title: "", description: "" }); setOfferImage(null); onRefresh();
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }

  async function updateExchangeStatus(exId, status) {
    const exchange = itemExchanges.find(e => e.id === exId);
    await exchangeDb.update(exId, { status, statusSeenByOfferer: false });
    if (status === "accepted") await listingDb.update(listing.id, { status: "exchanged" });
    if (exchange) {
      await notificationDb.create({
        userId: exchange.offererId,
        actorId: user.id,
        actorNumber: user.userNumber || null,
        type: `offer_${status}`,
        title: `Offer ${status}`,
        message: `Your offer for ${listing.title} was ${status}`,
        listingId: listing.id,
        exchangeId: exId,
      });
      trackEvent({ type: `offer_${status}`, label: listing.title, page: "item", userId: user.id, extra: { userNumber: user.userNumber, listingId: listing.id, exchangeId: exId, targetUserId: exchange.offererId } });
    }
    onRefresh();
  }

  useEffect(() => {
    if (isOwner && itemExchanges.some(e => e.seenByOwner === false)) {
      exchangeDb.markListingSeen(listing.id, user.id);
      notificationDb.markListingRead(user.id, listing.id);
    }
  }, [isOwner, listing.id, user?.id, itemExchanges.length]);

  async function deleteListing() {
    if (!confirm("Delete this listing?")) return;
    await listingDb.delete(listing.id);
    onNavigate("browse");
  }

  return (
    <div style={{ maxWidth: 860, margin: "2rem auto", padding: "0 1rem" }}>
      <button onClick={() => onNavigate("browse")} style={{ background: "none", border: "none", color: "#6b7280", cursor: "pointer", marginBottom: "1rem", fontSize: 14 }}>← Back to browse</button>
      <Alert type="error" msg={err} onClose={() => setErr("")} />
      <Alert type="success" msg={success} onClose={() => setSuccess("")} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
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
          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>{listing.category} · by <strong>{owner?.username || "Unknown"}</strong> <span style={{ color: "#9ca3af" }}>#{userNumber(owner)}</span> · {timeAgo(listing.createdAt)}</p>
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
            return (
              <div key={ex.id} style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "1rem", marginBottom: 10, display: "flex", gap: 12 }}>
                {ex.offerImage && <img src={ex.offerImage} alt="" style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, gap: 8 }}><strong style={{ fontSize: 14 }}>{ex.offerTitle}</strong><Badge status={ex.status} /></div>
                  <p style={{ margin: "0 0 4px", fontSize: 13, color: "#6b7280" }}>{ex.offerDescription}</p>
                  <p style={{ margin: "0 0 8px", fontSize: 12, color: "#9ca3af" }}>by {offerer?.username} #{userNumber(offerer)} · {timeAgo(ex.createdAt)}</p>
                  {ex.status === "pending" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => updateExchangeStatus(ex.id, "accepted")} style={{ padding: "5px 12px", background: "#d1fae5", border: "0.5px solid #6ee7b7", color: "#065f46", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>Accept</button>
                      <button onClick={() => updateExchangeStatus(ex.id, "declined")} style={{ padding: "5px 12px", background: "#fee2e2", border: "0.5px solid #fca5a5", color: "#991b1b", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>Decline</button>
                    </div>
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
              const unreadCount = exchanges.filter(e => e.listingId === l.id && e.seenByOwner === false).length;
              return (
                <div key={l.id} style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ height: 150, background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {l.imageBase64 ? <img src={l.imageBase64} alt={l.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 40 }}>📦</span>}
                  </div>
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, gap: 6 }}><h3 style={{ margin: 0, fontSize: 14, fontWeight: 500, flex: 1 }}>{l.title}</h3><Badge status={l.status} /></div>
                    <p style={{ margin: "0 0 8px", fontSize: 12, color: unreadCount ? "#dc2626" : "#6b7280", display: "flex", alignItems: "center", gap: 6 }}><RedDot show={unreadCount > 0} />{exCount} offer{exCount !== 1 ? "s" : ""}{unreadCount > 0 ? `, ${unreadCount} new` : ""}</p>
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

function MyExchangesPage({ user, listings, exchanges, users, onNavigate }) {
  const myOffers = user ? exchanges.filter(e => e.offererId === user.id) : [];
  useEffect(() => {
    if (user && myOffers.some(e => e.status !== "pending" && e.statusSeenByOfferer === false)) {
      exchangeDb.markOffererStatusSeen(user.id);
    }
  }, [user?.id, myOffers.length]);
  if (!user) return <div style={{ textAlign: "center", padding: "4rem" }}><button onClick={() => onNavigate("login")} style={{ color: "#d97706", background: "none", border: "none", cursor: "pointer" }}>Sign in →</button></div>;
  return (
    <div style={{ maxWidth: 800, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: 24, fontWeight: 500, fontFamily: "Georgia, serif", marginBottom: "1.5rem" }}>My exchange offers ({myOffers.length})</h1>
      {myOffers.length === 0
        ? <div style={{ textAlign: "center", padding: "4rem 0", color: "#6b7280" }}>No offers yet. <button onClick={() => onNavigate("browse")} style={{ color: "#d97706", background: "none", border: "none", cursor: "pointer" }}>Browse items →</button></div>
        : myOffers.map(ex => {
            const listing = listings.find(l => l.id === ex.listingId);
            const lo = listing && users.find(u => u.id === listing.userId);
            return (
              <div key={ex.id} style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "1rem", marginBottom: 10, display: "flex", gap: 12 }}>
                {ex.offerImage && <img src={ex.offerImage} alt="" style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 8, flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}><span style={{ fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}><RedDot show={ex.status !== "pending" && ex.statusSeenByOfferer === false} />You offered: {ex.offerTitle}</span><Badge status={ex.status} /></div>
                  <p style={{ margin: "0 0 4px", fontSize: 13, color: "#6b7280" }}>{ex.offerDescription}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>For: <button onClick={() => listing && onNavigate("item", listing.id)} style={{ background: "none", border: "none", color: "#d97706", cursor: "pointer", fontSize: 12, padding: 0 }}>{listing?.title || "Deleted listing"}</button>{lo && ` by ${lo.username}`} · {timeAgo(ex.createdAt)}</p>
                </div>
              </div>
            );
          })}
    </div>
  );
}

function ProfilePage({ user, onLogout }) {
  const [form, setForm] = useState({ oldPw: "", newPw: "", confirm: "" });
  const [err, setErr] = useState(""), [success, setSuccess] = useState(""), [loading, setLoading] = useState(false);
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
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "#9ca3af" }}>User ID #{userNumber(user)}</p>
            <span style={{ fontSize: 11, background: user.role === "admin" ? "#d97706" : "#f9fafb", color: user.role === "admin" ? "white" : "#6b7280", padding: "2px 8px", borderRadius: 20 }}>{user.role}</span>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>Member since {new Date(user.joined).toLocaleDateString()}</p>
      </div>
      <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, padding: "1.5rem", marginBottom: 14 }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: 16, fontWeight: 500 }}>Change password</h2>
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
      <button onClick={onLogout} style={{ width: "100%", padding: "11px", background: "#fee2e2", color: "#991b1b", border: "0.5px solid #fca5a5", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 500 }}>Sign out</button>
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

  filtered.forEach(e => {
    byType[e.type] = (byType[e.type] || 0) + 1;
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
                {["Type", "Label", "Page", "User", "Location", "Time"].map(h => (
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
                        <td style={{ padding: "7px 12px", color: "#6b7280" }}>{u ? u.username : (e.userId ? "deleted" : "guest")}</td>
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

function CleanAnalyticsPage({ users, listings, exchanges }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState("");
  const [timeRange, setTimeRange] = useState("7d");

  useEffect(() => {
    analyticsDb.getRecent(1000).then(data => { setEvents(data); setLoading(false); });
  }, []);

  if (loading) return <Spinner />;

  const now = Date.now();
  const ranges = { "24h": 86400000, "7d": 604800000, "30d": 2592000000, all: Infinity };
  const knownUsers = users.map(u => ({ ...u, userNumber: userNumber(u) }));
  const search = queryText.trim().toLowerCase();
  const inRange = events.filter(e => {
    const t = e.localTime ? new Date(e.localTime).getTime() : 0;
    return now - t <= (ranges[timeRange] || Infinity);
  });
  const filteredEvents = inRange.filter(e => {
    if (!search) return true;
    const u = knownUsers.find(x => x.id === e.userId);
    return [e.userNumber, u?.userNumber, u?.username, u?.email, e.type, e.label, e.page, e.listingTitle]
      .filter(Boolean)
      .some(v => String(v).toLowerCase().includes(search));
  });
  const activeUsers = new Set(filteredEvents.map(e => e.userId).filter(Boolean)).size;
  const offers = filteredEvents.filter(e => e.type?.includes("offer")).length;
  const posts = filteredEvents.filter(e => e.type === "listing_posted").length;
  const userRows = knownUsers.map(u => {
    const userEvents = inRange.filter(e => e.userId === u.id || String(e.userNumber) === String(u.userNumber));
    return {
      ...u,
      eventCount: userEvents.length,
      lastSeen: userEvents[0]?.localTime || u.lastLoginAt || u.joined,
      listings: listings.filter(l => l.userId === u.id).length,
      offers: exchanges.filter(ex => ex.offererId === u.id).length,
    };
  }).filter(u => !search || [u.userNumber, u.username, u.email, u.role].some(v => String(v || "").toLowerCase().includes(search)))
    .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
  const statStyle = { background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: 8, padding: "14px 16px" };
  const typeColors = { page_view: "#2563eb", cta_click: "#d97706", offer_submitted: "#7c3aed", offer_accepted: "#059669", offer_declined: "#dc2626", listing_posted: "#0891b2", login: "#4b5563", register: "#be185d" };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <input value={queryText} onChange={e => setQueryText(e.target.value)} placeholder="Search user ID, name, email, event, listing" style={{ minWidth: 260, flex: 1 }} />
        <div style={{ display: "flex", gap: 6 }}>
          {["24h", "7d", "30d", "all"].map(r => (
            <button key={r} onClick={() => setTimeRange(r)} style={{ padding: "7px 12px", border: "0.5px solid #e5e7eb", borderRadius: 8, background: timeRange === r ? "#111827" : "#fff", color: timeRange === r ? "#fff" : "#374151", cursor: "pointer", fontSize: 12 }}>{r === "all" ? "All" : r}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        <div style={statStyle}><p style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>Events</p><strong style={{ fontSize: 26 }}>{filteredEvents.length}</strong></div>
        <div style={statStyle}><p style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>Active users</p><strong style={{ fontSize: 26 }}>{activeUsers}</strong></div>
        <div style={statStyle}><p style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>Offer activity</p><strong style={{ fontSize: 26 }}>{offers}</strong></div>
        <div style={statStyle}><p style={{ margin: 0, color: "#6b7280", fontSize: 12 }}>Posts</p><strong style={{ fontSize: 26 }}>{posts}</strong></div>
      </div>

      <div style={{ background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", borderBottom: "0.5px solid #e5e7eb", display: "flex", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Users</h3>
          <span style={{ fontSize: 12, color: "#6b7280" }}>{userRows.length} shown</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ background: "#f9fafb" }}>{["User ID","User","Role","Events","Listings","Offers","Last activity"].map(h => <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "#6b7280", fontWeight: 600 }}>{h}</th>)}</tr></thead>
            <tbody>{userRows.slice(0, 25).map(u => (
              <tr key={u.id} style={{ borderTop: "0.5px solid #f3f4f6" }}>
                <td style={{ padding: "9px 12px", fontWeight: 600 }}>#{u.userNumber}</td>
                <td style={{ padding: "9px 12px" }}><div style={{ fontWeight: 500 }}>{u.username}</div><div style={{ color: "#6b7280" }}>{u.email}</div></td>
                <td style={{ padding: "9px 12px", color: "#6b7280" }}>{u.role}</td>
                <td style={{ padding: "9px 12px" }}>{u.eventCount}</td>
                <td style={{ padding: "9px 12px" }}>{u.listings}</td>
                <td style={{ padding: "9px 12px" }}>{u.offers}</td>
                <td style={{ padding: "9px 12px", color: "#6b7280" }}>{u.lastSeen ? timeAgo(u.lastSeen) : "none"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      <div style={{ background: "#fff", border: "0.5px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "12px 14px", borderBottom: "0.5px solid #e5e7eb" }}><h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Recent actions</h3></div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ background: "#f9fafb" }}>{["Time","User ID","User","Action","Page","Details"].map(h => <th key={h} style={{ padding: "9px 12px", textAlign: "left", color: "#6b7280", fontWeight: 600 }}>{h}</th>)}</tr></thead>
            <tbody>{filteredEvents.slice(0, 80).map(e => {
              const u = knownUsers.find(x => x.id === e.userId);
              return (
                <tr key={e.id} style={{ borderTop: "0.5px solid #f3f4f6" }}>
                  <td style={{ padding: "9px 12px", color: "#6b7280", whiteSpace: "nowrap" }}>{e.localTime ? timeAgo(e.localTime) : "now"}</td>
                  <td style={{ padding: "9px 12px", fontWeight: 600 }}>{u ? `#${u.userNumber}` : e.userNumber ? `#${e.userNumber}` : "guest"}</td>
                  <td style={{ padding: "9px 12px" }}>{u?.username || "Guest"}</td>
                  <td style={{ padding: "9px 12px" }}><span style={{ color: typeColors[e.type] || "#374151", fontWeight: 600 }}>{e.type?.replace(/_/g, " ")}</span></td>
                  <td style={{ padding: "9px 12px", color: "#6b7280" }}>{e.page || "-"}</td>
                  <td style={{ padding: "9px 12px", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label || e.listingTitle || "-"}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AdminPage({ user, listings, exchanges, users, onRefresh, onNavigate }) {
  const [tab, setTab] = useState("analytics");
  if (!user || user.role !== "admin") return <div style={{ textAlign: "center", padding: "4rem" }}>Access denied. Admin only.</div>;

  async function toggleUser(id) {
    const target = users.find(u => u.id === id); if (!target) return;
    await userDb.update(id, { active: !target.active }); onRefresh();
  }
  async function deleteUser(id) {
    if (!confirm("Delete user and all their listings?")) return;
    await userDb.delete(id); await listingDb.deleteByUser(id); onRefresh();
  }
  async function deleteListing(id) { if (!confirm("Delete this listing?")) return; await listingDb.delete(id); onRefresh(); }
  async function deleteExchange(id) { await exchangeDb.delete(id); onRefresh(); }

  const stats = [
    { l: "Total users",    v: users.length },
    { l: "Total listings", v: listings.length },
    { l: "Available",      v: listings.filter(l => l.status === "available").length },
    { l: "Exchanges done", v: exchanges.filter(e => e.status === "accepted").length },
  ];

  const TabBtn = ({ id, l }) => (
    <button onClick={() => setTab(id)} style={{ padding: "8px 16px", border: "none", cursor: "pointer", fontSize: 13, background: tab === id ? "#d97706" : "#f3f4f6", color: tab === id ? "white" : "#374151", borderRadius: 8 }}>{l}</button>
  );

  return (
    <div style={{ maxWidth: 1000, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ fontSize: 24, fontWeight: 500, fontFamily: "Georgia, serif", marginBottom: "1.5rem" }}>Admin dashboard</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 20 }}>
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
      </div>

      {tab === "analytics" && <CleanAnalyticsPage users={users} listings={listings} exchanges={exchanges} />}

      {tab !== "analytics" && (
        <div style={{ background: "#fff", border: "0.5px solid #f3f4f6", borderRadius: 12, overflow: "auto" }}>
          {tab === "users" && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ background: "#f9fafb" }}>{["User ID","User","Email","Role","Joined","Status","Actions"].map(h => <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 500, color: "#6b7280", whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
              <tbody>{users.map(u => (
                <tr key={u.id} style={{ borderTop: "0.5px solid #f9fafb" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600 }}>#{userNumber(u)}</td>
                  <td style={{ padding: "10px 12px", fontWeight: 500 }}>{u.username}</td>
                  <td style={{ padding: "10px 12px", color: "#6b7280" }}>{u.email}</td>
                  <td style={{ padding: "10px 12px" }}><span style={{ fontSize: 11, background: u.role === "admin" ? "#d97706" : "#f9fafb", color: u.role === "admin" ? "white" : "#6b7280", padding: "2px 8px", borderRadius: 20 }}>{u.role}</span></td>
                  <td style={{ padding: "10px 12px", color: "#6b7280" }}>{new Date(u.joined).toLocaleDateString()}</td>
                  <td style={{ padding: "10px 12px" }}><span style={{ fontSize: 11, background: u.active ? "#d1fae5" : "#fee2e2", color: u.active ? "#065f46" : "#991b1b", padding: "2px 8px", borderRadius: 20 }}>{u.active ? "Active" : "Suspended"}</span></td>
                  <td style={{ padding: "10px 12px" }}>
                    {u.id !== user.id && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => toggleUser(u.id)} style={{ padding: "4px 8px", fontSize: 11, borderRadius: 6, border: "0.5px solid #e5e7eb", cursor: "pointer", background: "#f9fafb", whiteSpace: "nowrap" }}>{u.active ? "Suspend" : "Restore"}</button>
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

function Navbar({ user, page, onNavigate, onLogout, listings = [], exchanges = [] }) {
  const unreadListings = user ? exchanges.filter(e => {
    const listing = listings.find(l => l.id === e.listingId);
    return listing?.userId === user.id && e.seenByOwner === false;
  }).length : 0;
  const unreadOffers = user ? exchanges.filter(e => e.offererId === user.id && e.status !== "pending" && e.statusSeenByOfferer === false).length : 0;
  const navItems = [
    { id: "browse", l: "Browse" },
    ...(user ? [
      { id: "post", l: "Post item" },
      { id: "my-listings", l: "My listings", dot: unreadListings > 0 },
      { id: "my-exchanges", l: "Exchanges", dot: unreadOffers > 0 },
      ...(user.role === "admin" ? [{ id: "admin", l: "Admin ★" }] : []),
    ] : []),
  ];
  return (
    <nav style={{ background: "#fff", borderBottom: "0.5px solid #f3f4f6", padding: "0 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: 52, position: "sticky", top: 0, zIndex: 100 }}>
      <button onClick={() => onNavigate("home")} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
        <span style={{ fontSize: 20 }}>⚖️</span>
        <span style={{ fontSize: 16, fontWeight: 500, fontFamily: "Georgia, serif", color: "#d97706" }}>BarterHub</span>
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        {navItems.map(n => (
          <button key={n.id} onClick={() => { trackCTA(`nav_${n.id}`, page, user?.id); onNavigate(n.id); }}
            style={{ padding: "6px 10px", background: page === n.id ? "#f9fafb" : "none", border: "none", cursor: "pointer", fontSize: 13, borderRadius: 8, color: n.id === "admin" ? "#d97706" : "#111827", fontWeight: n.id === "admin" ? 500 : 400 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{n.l}<RedDot show={n.dot} /></span>
          </button>
        ))}
        {user
          ? <button onClick={() => onNavigate("profile")} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: "none", border: "0.5px solid #e5e7eb", borderRadius: 20, cursor: "pointer", fontSize: 13, marginLeft: 4 }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#d97706", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 500, flexShrink: 0 }}>{user.username[0].toUpperCase()}</span>
              <span>{user.username}</span>
              <span style={{ color: "#9ca3af", fontSize: 11 }}>#{userNumber(user)}</span>
            </button>
          : <div style={{ display: "flex", gap: 6, marginLeft: 4 }}>
              <button onClick={() => { trackCTA("nav_sign_in", page); onNavigate("login"); }} style={{ padding: "6px 14px", background: "none", border: "0.5px solid #e5e7eb", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>Sign in</button>
              <button onClick={() => { trackCTA("nav_register", page); onNavigate("register"); }} style={{ padding: "6px 14px", background: "#d97706", color: "white", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>Register</button>
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
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    await userDb.ensureUserNumbers();
    const [u, l, e] = await Promise.all([userDb.getAll(), listingDb.getAll(), exchangeDb.getAll()]);
    setUsers(u); setListings(l); setExchanges(e);
    return { users: u, listings: l, exchanges: e };
  }

  useEffect(() => {
    async function init(){
  try {
    console.log("1. starting...");
    await auth.seedAdmin();
    console.log("2. seedAdmin done");
    const me = await auth.me();
    console.log("3. auth.me done", me);
    setUser(me);
    const fresh = await loadAll();
    if (me) setUser(fresh.users.find(u => u.id === me.id) || me);
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
      trackPageView(page, user?.id, { userNumber: user?.userNumber || null });
    }
  }, [page, loading, user?.id]);

  function navigate(p, param = null) { setPage(p); setPageParam(param); }

  async function handleLogin(u) {
    const fresh = await loadAll();
    setUser(fresh.users.find(x => x.id === u.id) || u);
    navigate("home");
  }
  async function handleLogout() { await auth.logout(); setUser(null); navigate("home"); }

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Spinner />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <Navbar user={user} page={page} onNavigate={navigate} onLogout={handleLogout} listings={listings} exchanges={exchanges} />
      <main>
        {page === "home"         && <HomePage onNavigate={navigate} listings={listings} users={users} currentUser={user} />}
        {page === "browse"       && <BrowsePage listings={listings} users={users} onNavigate={navigate} currentUser={user} />}
        {page === "post"         && <PostItemPage user={user} onPosted={loadAll} onNavigate={navigate} />}
        {page === "item"         && <ItemDetailPage listingId={pageParam} listings={listings} users={users} exchanges={exchanges} user={user} onNavigate={navigate} onRefresh={loadAll} />}
        {page === "my-listings"  && <MyListingsPage user={user} listings={listings} exchanges={exchanges} onNavigate={navigate} onRefresh={loadAll} />}
        {page === "my-exchanges" && <MyExchangesPage user={user} listings={listings} exchanges={exchanges} users={users} onNavigate={navigate} />}
        {page === "profile"      && <ProfilePage user={user} onLogout={handleLogout} />}
        {page === "admin"        && <AdminPage user={user} listings={listings} exchanges={exchanges} users={users} onRefresh={loadAll} onNavigate={navigate} />}
        {page === "login"        && <LoginPage onLogin={handleLogin} onNavigate={navigate} />}
        {page === "register"     && <RegisterPage onLogin={handleLogin} onNavigate={navigate} />}
      </main>
    </div>
  );
}
