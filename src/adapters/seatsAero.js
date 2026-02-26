// src/adapters/seatsAero.js
// Seats.aero Partner API (Pro key) - Cached Search
// Auth header: Partner-Authorization: pro_xxx  (per seats.aero KB)  :contentReference[oaicite:2]{index=2}

const BASE_URL = "https://seats.aero/partnerapi/search";

/**
 * Map your internal cabin enum -> seats cabin strings.
 * If seats expects different values, change here only.
 */
function mapCabin(cabin) {
  switch (cabin) {
    case "economy":
      return "economy";
    case "premium_economy":
      return "premium";
    case "business":
      return "business";
    case "first":
      return "first";
    default:
      return "economy";
  }
}

/**
 * Build query params for Seats cached search.
 * The exact parameter names may differ; this is a sane default.
 * If you get 400, look at the logged response JSON and adjust here.
 */
function buildSeatsQuery(q) {
  const params = new URLSearchParams();

  // Most common naming patterns for award APIs:
  // origin/destination + departure_date (YYYY-MM-DD)
  params.set("origin", q.from);
  params.set("destination", q.to);
  params.set("departure_date", q.date);

  // Optional filters
  params.set("cabin", mapCabin(q.cabin));

  if (typeof q.nonstop === "boolean") params.set("nonstop", String(q.nonstop));
  if (typeof q.flexibleDays === "number" && q.flexibleDays > 0) {
    params.set("flexible_days", String(q.flexibleDays));
  }

  // Some APIs support pax; some don't for availability caches.
  // Keep it optional; if seats rejects it, remove.
  if (typeof q.passengers === "number") params.set("passengers", String(q.passengers));

  return params;
}

/**
 * Normalize Seats response into your internal Results[] format.
 * Since the response schema is not shown in static HTML, we defensively map.
 */
function normalizeSeatsResponse(json, q) {
  // Many APIs return either { data: [...] } or [...].
  const rows = Array.isArray(json) ? json : (json?.data || json?.results || []);

  const results = [];

  for (const r of rows) {
    // Try common field names defensively:
    const program = r.program || r.mileage_program || r.loyaltyProgram || "SeatsAero";
    const pointsCost =
      r.points || r.miles || r.cost?.points || r.cost?.miles || r.price?.points || null;
    const taxes =
      r.taxes || r.cost?.taxes || r.price?.taxes || r.fees || null;

    // Segment inference (very defensive)
    const seg = {
      from: r.origin || r.from || q.from,
      to: r.destination || r.to || q.to,
      dep: r.departure || r.departure_time || r.departure_date || q.date,
      arr: r.arrival || r.arrival_time || r.arrival_date || q.date,
      carrier: r.carrier || r.airline || r.marketing_carrier || null,
      flightNo: r.flight_number || r.flightNo || null,
      cabin: r.cabin || q.cabin,
    };

    results.push({
      summary: r.summary || `${seg.from}→${seg.to}`,
      pointsCost: pointsCost ?? 0,
      taxes: taxes ?? 0,
      program,
      segments: [seg],
      source: "seats.aero",
      deepLink: r.url || r.deep_link || r.link || null,
      raw: r, // 可选：方便 debug
    });
  }

  return results;
}

/**
 * Main entry: cached search.
 * Returns normalized Results[].
 */
async function searchSeatsAeroCached(queryParams) {
  const apiKey = process.env.SEATS_AERO_API_KEY;
  if (!apiKey) {
    throw new Error("Missing SEATS_AERO_API_KEY in .env");
  }

  const params = buildSeatsQuery(queryParams);
  const url = `${BASE_URL}?${params.toString()}`;

  // Node 18+ has global fetch. If you are on older Node, install node-fetch.
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Partner-Authorization": apiKey, // :contentReference[oaicite:3]{index=3}
      "Accept": "application/json",
    },
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { _nonJsonBody: text };
  }

  // Helpful rate limit header (seats mentions X-RateLimit-Remaining) :contentReference[oaicite:4]{index=4}
  const remaining = res.headers.get("X-RateLimit-Remaining");

  if (!res.ok) {
    console.error("[seats.aero] HTTP", res.status, "URL:", url);
    console.error("[seats.aero] Body:", json);
    if (remaining !== null) console.error("[seats.aero] X-RateLimit-Remaining:", remaining);

    // Surface a user-friendly error upward
    const msg =
      json?.message ||
      json?.error ||
      `Seats.aero API error (HTTP ${res.status})`;
    throw new Error(msg);
  }

  if (remaining !== null) {
    console.log("[seats.aero] X-RateLimit-Remaining:", remaining);
  }

  return normalizeSeatsResponse(json, queryParams);
}

module.exports = { searchSeatsAeroCached };