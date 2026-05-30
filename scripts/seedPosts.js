import { initializeApp } from "firebase/app";
import { firebaseConfig } from "./firebaseConfig.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  addDoc,
  updateDoc,
} from "firebase/firestore";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const dailyMode = process.argv.includes("--daily");
const sheetMode = process.argv.includes("--sheet") || Boolean(process.env.GOOGLE_SHEET_CSV_URL);

const seedUser = {
  id: "swapcircle-community-seed",
  username: "SwapCircle Daily",
  email: "daily@swapcircle.local",
  role: "user",
  active: true,
  joined: new Date().toISOString(),
  userNumber: 1001,
  following: [],
  interests: {},
  seedAccount: true,
};

const starterPosts = [
  ["Weekend board game bundle", "A clean set of family games for anyone building a cozy game night stack.", "Books", "Plants, lamps, or a small bluetooth speaker", "https://placehold.co/900x650/fff7ed/9a3412.png?text=Board+Game+Bundle"],
  ["Study desk lamp", "Warm LED desk lamp with three brightness modes. Good for students or night readers.", "Electronics", "Novels, notebooks, or a phone stand", "https://placehold.co/900x650/ecfeff/155e75.png?text=Desk+Lamp"],
  ["Denim jacket", "Classic blue denim jacket, barely used, medium fit.", "Clothing", "Sneakers, hoodies, or sports gear", "https://placehold.co/900x650/eff6ff/1d4ed8.png?text=Denim+Jacket"],
  ["Mini tool kit", "Compact screwdriver and repair kit for quick home fixes.", "Tools", "Kitchen items or a backpack", "https://placehold.co/900x650/fefce8/854d0e.png?text=Mini+Tool+Kit"],
  ["Coffee table", "Simple wooden coffee table, sturdy and easy to move.", "Furniture", "A plant shelf or floor lamp", "https://placehold.co/900x650/fafaf9/57534e.png?text=Coffee+Table"],
  ["Homemade pickle jars", "Small batch spicy pickle jars made this week.", "Food", "Books, storage boxes, or art supplies", "https://placehold.co/900x650/f0fdf4/166534.png?text=Pickle+Jars"],
  ["Sketchbook set", "Two unused sketchbooks and a pack of pencils for new artists.", "Art", "A small table plant or headphones", "https://placehold.co/900x650/fdf2f8/9d174d.png?text=Sketchbook+Set"],
  ["Cricket bat", "Practice bat in good condition for weekend matches.", "Sports", "Dumbbells, shoes, or a backpack", "https://placehold.co/900x650/f0f9ff/0369a1.png?text=Cricket+Bat"],
  ["Phone tripod stand", "Adjustable tripod for reels, product photos, or video calls.", "Electronics", "Desk organizer or books", "https://placehold.co/900x650/f5f3ff/6d28d9.png?text=Phone+Tripod"],
  ["Plant cuttings bundle", "Healthy indoor plant cuttings ready for a new corner.", "Other", "Mugs, art, or a small basket", "https://placehold.co/900x650/ecfdf5/047857.png?text=Plant+Cuttings"],
  ["Cookbook collection", "Three cookbooks with simple weekday recipes.", "Books", "Kitchen tools or food containers", "https://placehold.co/900x650/fff1f2/be123c.png?text=Cookbook+Collection"],
  ["Wall art frame", "Minimal frame that works well for posters or prints.", "Art", "A lamp, plant, or small shelf", "https://placehold.co/900x650/f8fafc/334155.png?text=Wall+Art+Frame"],
];

const dailyPosts = [
  ["Mystery swap box", "A small surprise box with useful desk items. Fun little swap for curious people.", "Other", "Anything equally fun", "https://placehold.co/900x650/fffbeb/a16207.png?text=Mystery+Swap+Box"],
  ["Sunday snack basket", "A cheerful basket of packaged snacks for a friendly community swap.", "Food", "Books or small decor", "https://placehold.co/900x650/fef2f2/b91c1c.png?text=Snack+Basket"],
  ["Tiny tech rescue kit", "Charging cable, cable clips, and a phone stand for someone who likes tidy desks.", "Electronics", "A notebook or lamp", "https://placehold.co/900x650/e0f2fe/075985.png?text=Tech+Rescue+Kit"],
  ["Weekend hobby starter pack", "A mix of pencils, sticky notes, and small craft bits to start a tiny project.", "Art", "Plant cuttings or a mug", "https://placehold.co/900x650/fae8ff/86198f.png?text=Hobby+Starter+Pack"],
  ["Fitness reset bundle", "Skipping rope and water bottle for someone restarting their routine.", "Sports", "Books or storage boxes", "https://placehold.co/900x650/ecfccb/3f6212.png?text=Fitness+Bundle"],
];

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function sheetCsvUrl(input) {
  if (!input) return "";
  const trimmed = input.trim();
  const gid = trimmed.match(/[?&]gid=([^&]+)/)?.[1] || "0";
  const id = trimmed.match(/\/spreadsheets\/d\/([^/]+)/)?.[1];
  if (id) return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  return trimmed;
}

async function postsFromSheet() {
  const url = sheetCsvUrl(process.env.GOOGLE_SHEET_CSV_URL);
  if (!url) throw new Error("Set GOOGLE_SHEET_CSV_URL to a published Google Sheet CSV URL or share URL.");

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Google Sheet fetch failed: ${response.status} ${response.statusText}`);

  const rows = parseCsv(await response.text());
  const [headers, ...body] = rows;
  const normalizedHeaders = headers.map(h => h.toLowerCase().replace(/\s+/g, ""));
  const index = (name) => normalizedHeaders.indexOf(name.toLowerCase());
  const titleIndex = index("title");
  const descriptionIndex = index("description");
  const categoryIndex = index("category");
  const wantIndex = index("wantinreturn") >= 0 ? index("wantinreturn") : index("wants");
  const imageIndex = index("imageurl") >= 0 ? index("imageurl") : index("image");
  const activeIndex = index("active");

  if ([titleIndex, descriptionIndex, categoryIndex, wantIndex].some(i => i < 0)) {
    throw new Error("Sheet must include columns: title, description, category, wantInReturn");
  }

  return body
    .filter(row => activeIndex < 0 || String(row[activeIndex] || "").toLowerCase() !== "false")
    .map(row => [
      row[titleIndex],
      row[descriptionIndex],
      row[categoryIndex],
      row[wantIndex],
      imageIndex >= 0 ? row[imageIndex] : null,
    ])
    .filter(post => post.every(Boolean));
}

async function ensureSeedUser() {
  await setDoc(doc(db, "users", seedUser.id), seedUser, { merge: true });
  return seedUser;
}

async function existingSeedDocs() {
  const snap = await getDocs(query(collection(db, "listings"), where("seedSource", "==", "swapcircle-seed")));
  return new Map(snap.docs.map(d => [d.data().seedKey, { ref: d.ref, data: d.data() }]).filter(([key]) => Boolean(key)));
}

async function createListing(user, post, index, seedKey) {
  const [title, description, category, wantInReturn] = post;
  const imageUrl = post[4] || null;
  await addDoc(collection(db, "listings"), {
    userId: user.id,
    title,
    description,
    category,
    wantInReturn,
    imageBase64: imageUrl,
    status: "available",
    likedBy: [],
    likeCount: 0,
    seedSource: "swapcircle-seed",
    seedKey,
    createdAt: new Date(Date.now() - index * 60 * 60 * 1000).toISOString(),
  });
}

async function main() {
  const user = await ensureSeedUser();
  const existing = await existingSeedDocs();
  const sourcePosts = sheetMode ? await postsFromSheet() : starterPosts;
  const posts = dailyMode
    ? [sourcePosts[new Date().getDate() % sourcePosts.length] || dailyPosts[new Date().getDate() % dailyPosts.length]]
    : sourcePosts;
  let created = 0;
  let updated = 0;

  for (const [index, post] of posts.entries()) {
    const seedKey = dailyMode
      ? `daily-${todayKey()}-${post[0].toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
      : `${sheetMode ? "sheet" : "starter"}-${post[0].toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const existingPost = existing.get(seedKey);
    if (existingPost) {
      const imageUrl = post[4] || null;
      if (imageUrl && existingPost.data.imageBase64 !== imageUrl) {
        await updateDoc(existingPost.ref, { imageBase64: imageUrl });
        updated += 1;
      }
      continue;
    }
    await createListing(user, post, index, seedKey);
    created += 1;
  }

  console.log(`${created} seed post${created === 1 ? "" : "s"} added. ${updated} image${updated === 1 ? "" : "s"} updated.`);
}

main().catch(error => {
  console.error("Seed failed:", error);
  process.exit(1);
});
