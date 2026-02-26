// src/adapters/amadeus.js
const TOKEN_URL_TEST = "https://test.api.amadeus.com/v1/security/oauth2/token";
const API_BASE_TEST = "https://test.api.amadeus.com";

let tokenCache = {
  accessToken: null,
  expiresAtMs: 0,
};

// OAuth token (client credentials) :contentReference[oaicite:4]{index=4}
async function getAccessToken() {
  const key = process.env.AMADEUS_API_KEY;
  const secret = process.env.AMADEUS_API_SECRET;
  if (!key || !secret) throw new Error("Missing AMADEUS_API_KEY / AMADEUS_API_SECRET");

  const now = Date.now();
  if (tokenCache.accessToken && now < tokenCache.expiresAtMs - 30_000) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams();
  body.set("grant_type", "client_credentials");
  body.set("client_id", key);
  body.set("client_secret", secret);

  const res = await fetch(TOKEN_URL_TEST, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[amadeus token] status", res.status, json);
    throw new Error(json?.error_description || json?.error || `Token error HTTP ${res.status}`);
  }

  const accessToken = json.access_token;
  const expiresInSec = json.expires_in || 1800;
  tokenCache = {
    accessToken,
    expiresAtMs: Date.now() + expiresInSec * 1000,
  };
  return accessToken;
}

// Flight Offers Search :contentReference[oaicite:5]{index=5}
function mapTravelClass(cabin) {
  // Amadeus 常用：ECONOMY / PREMIUM_ECONOMY / BUSINESS / FIRST
  switch (cabin) {
    case "economy": return "ECONOMY";
    case "premium_economy": return "PREMIUM_ECONOMY";
    case "business": return "BUSINESS";
    case "first": return "FIRST";
    default: return "ECONOMY";
  }
}

function normalizeOffers(json) {
  const offers = json?.data || [];
  const results = [];

  for (const offer of offers) {
    const priceTotal = Number(offer?.price?.total ?? 0);
    const currency = offer?.price?.currency || "USD";

    // itinerary/segments（可能多段）
    const itineraries = offer?.itineraries || [];
    const segs = [];
    for (const it of itineraries) {
      for (const s of it?.segments || []) {
        segs.push({
          from: s?.departure?.iataCode,
          to: s?.arrival?.iataCode,
          dep: s?.departure?.at,
          arr: s?.arrival?.at,
          carrier: s?.carrierCode,
          flightNo: s?.number ? `${s?.carrierCode || ""}${s.number}` : null,
          cabin: null, // Amadeus cabin 在 travelerPricing/fareDetailsBySegment 里，M1 先不深挖
        });
      }
    }

    results.push({
      summary: segs.length ? `${segs[0].from}→${segs[segs.length - 1].to}` : "Offer",
      cashTotal: priceTotal,
      currency,
      segments: segs,
      source: "amadeus",
      raw: offer, // 调试用
    });
  }

  return results;
}

async function searchAmadeusFlightOffers(q) {
  const token = await getAccessToken();

  // endpoint: /v2/shopping/flight-offers :contentReference[oaicite:6]{index=6}
  const params = new URLSearchParams();
  params.set("originLocationCode", q.from);         // IATA
  params.set("destinationLocationCode", q.to);      // IATA
  params.set("departureDate", q.date);              // YYYY-MM-DD
  params.set("adults", String(q.passengers || 1));
  params.set("travelClass", mapTravelClass(q.cabin));
  if (q.nonstop) params.set("nonStop", "true");
  params.set("max", "20");

  const url = `${API_BASE_TEST}/v2/shopping/flight-offers?${params.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[amadeus offers] status", res.status, json);
    throw new Error(json?.errors?.[0]?.detail || `Offers error HTTP ${res.status}`);
  }

  return normalizeOffers(json);
}

module.exports = { searchAmadeusFlightOffers };