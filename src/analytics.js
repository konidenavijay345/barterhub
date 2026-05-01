// analytics.js — Tracks user events to Firestore
// Events: page_view, cta_click, offer_submitted, listing_posted, login, register

import { db } from "./firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

let cachedLocation = null;

// Fetch IP-based location once and cache it
async function getLocation() {
  if (cachedLocation) return cachedLocation;
  try {
    const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    cachedLocation = {
      city: data.city || "Unknown",
      region: data.region || "",
      country: data.country_name || "Unknown",
      countryCode: data.country_code || "",
      lat: data.latitude || null,
      lng: data.longitude || null,
      ip: data.ip || "",
      timezone: data.timezone || "",
    };
  } catch {
    cachedLocation = { city: "Unknown", country: "Unknown", lat: null, lng: null };
  }
  return cachedLocation;
}

export async function trackEvent({ type, label = "", page = "", userId = null, extra = {} }) {
  try {
    const location = await getLocation();
    await addDoc(collection(db, "analytics_events"), {
      type,           // 'page_view' | 'cta_click' | 'offer_submitted' | 'listing_posted' | 'login' | 'register'
      label,          // button label or page title
      page,           // current page id
      userId,         // logged-in user id or null
      location,       // { city, country, lat, lng, ... }
      userAgent: navigator.userAgent,
      referrer: document.referrer || "",
      timestamp: serverTimestamp(),
      localTime: new Date().toISOString(),
      ...extra,
    });
  } catch (e) {
    // Silent fail — never break the app for analytics
    console.warn("Analytics error:", e);
  }
}

export function trackPageView(page, userId = null) {
  return trackEvent({ type: "page_view", label: page, page, userId });
}

export function trackCTA(label, page, userId = null) {
  return trackEvent({ type: "cta_click", label, page, userId });
}
