# BarterHub — Deployment Guide
## 100% Free Hosting in 15 Minutes

---

## What You're Using (All Free)

| Service | Purpose | Free Tier |
|---|---|---|
| **Firebase Firestore** | Database | 1GB storage, 50k reads/day, 20k writes/day |
| **ipapi.co** | User location detection | 1,000 requests/day, no key needed |
| **Vercel** | Website hosting | Unlimited personal projects |

---

## STEP 1 — Set Up Firebase (5 min)

1. Go to **https://console.firebase.google.com**
2. Click **"Create a project"** → name it `barterhub` → click Continue
3. Disable Google Analytics (not needed) → **Create project**
4. Once created, click **"</> Web"** icon to add a web app
5. Give it a nickname (e.g. `barterhub-web`) → click **Register app**
6. **COPY the firebaseConfig object** — it looks like this:
   ```js
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "barterhub-xxxxx.firebaseapp.com",
     projectId: "barterhub-xxxxx",
     storageBucket: "barterhub-xxxxx.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123",
   };
   ```
7. Paste these values into **`src/firebase.js`** replacing the placeholders

### Enable Firestore Database
1. In Firebase Console → left sidebar → **Build → Firestore Database**
2. Click **"Create database"**
3. Select **"Start in test mode"** → Next
4. Choose a location (pick closest to your users) → **Enable**
5. Done! Your database is live.

---

## STEP 2 — Add Your Firebase Config to the Code

Open `src/firebase.js` and replace the placeholder values with your real config:

```js
const firebaseConfig = {
  apiKey: "YOUR_REAL_API_KEY",
  authDomain: "YOUR_REAL_AUTH_DOMAIN",
  projectId: "YOUR_REAL_PROJECT_ID",
  storageBucket: "YOUR_REAL_STORAGE_BUCKET",
  messagingSenderId: "YOUR_REAL_SENDER_ID",
  appId: "YOUR_REAL_APP_ID",
};
```

---

## STEP 3 — Deploy to Vercel (5 min)

### Option A: GitHub (Recommended — auto-deploys on every change)

1. Push your project to a GitHub repo:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/barterhub.git
   git push -u origin main
   ```

2. Go to **https://vercel.com** → Sign up (free, use GitHub login)
3. Click **"New Project"** → Import your `barterhub` repo
4. Leave all settings as default (Vercel auto-detects Vite)
5. Click **"Deploy"**
6. In ~1 minute, your site is live at `https://barterhub-xxxx.vercel.app`

### Option B: Vercel CLI (No GitHub needed)

```bash
npm install -g vercel
cd barterhub
npm install
vercel
```
Follow the prompts — your site will be live in under 2 minutes.

---

## STEP 4 — Test Your Analytics

1. Open your live site
2. Click some buttons, browse listings
3. Log in as admin (`admin` / `admin123`)
4. Go to **Admin ★ → Analytics tab**
5. You should see:
   - Page views counted
   - CTA clicks with labels
   - Your location detected
   - Activity by hour chart
   - Live event log

---

## Analytics Events Tracked

| Event | Trigger |
|---|---|
| `page_view` | Every page navigation |
| `cta_click` | Any button click (with label) |
| `offer_submitted` | User submits a barter offer |
| `listing_posted` | User posts a new item |
| `login` | Successful login |
| `register` | New account created |

### Data Captured Per Event
- **Timestamp** (server + local ISO time)
- **Location** (city, country, lat/lng via IP)
- **User** (userId if logged in, null if guest)
- **Page** (which page they were on)
- **Label** (which button/action)
- **User Agent** (browser info)

---

## Viewing Raw Analytics in Firebase

1. Firebase Console → Firestore Database → `analytics_events` collection
2. You can filter, sort, and export from here

---

## Going Beyond Free (Optional)

You don't need to pay anything to run BarterHub for hundreds of users.
If you grow to thousands of daily users, options are:

- **Firebase Blaze plan** — pay only for what you use (~$0.06/100k reads)
- **Custom domain** — ~$10/year from Namecheap or Google Domains, connect to Vercel for free

---

## Default Admin Credentials

```
Username: admin
Password: admin123
```

⚠️ Change this password immediately after first login via Profile → Change password.

---

## Folder Structure

```
barterhub/
├── src/
│   ├── App.jsx          ← Main app (all pages + analytics tracking)
│   ├── analytics.js     ← Event tracking module
│   ├── database.js      ← Firestore CRUD operations
│   ├── auth.js          ← Login / register / session
│   ├── firebase.js      ← ← YOUR FIREBASE CONFIG GOES HERE
│   ├── main.jsx         ← React entry point
│   └── index.css        ← Global styles
├── index.html
├── package.json
├── vite.config.js
├── vercel.json          ← Handles SPA routing on Vercel
├── firestore.rules      ← Database security rules
└── DEPLOY.md            ← This file
```
