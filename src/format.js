// src/format.js

function fmtMoney(n) {
  if (n === null || n === undefined) return "N/A";
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return num.toFixed(2).replace(/\.00$/, "");
}

function shortIso(iso) {
  if (!iso || typeof iso !== "string") return "N/A";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/);
  if (!m) return iso;
  return `${m[2]}-${m[3]} ${m[4]}`;
}

function parseMs(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

function summarize(segments = []) {
  if (!segments.length) {
    return { route: "N/A", dep: "N/A", arr: "N/A", stops: 999, carriers: "N/A", depMs: null, arrMs: null };
  }
  const first = segments[0];
  const last = segments[segments.length - 1];
  const stops = Math.max(0, segments.length - 1);
  const carriers = Array.from(new Set(segments.map(s => s.carrier).filter(Boolean))).join("/") || "N/A";
  const depMs = parseMs(first.dep);
  const arrMs = parseMs(last.arr);
  return {
    route: `${first.from}→${last.to}`,
    dep: shortIso(first.dep),
    arr: shortIso(last.arr),
    stops,
    carriers,
    depMs,
    arrMs,
  };
}

function inferPreference(userText = "", queryParams = {}) {
  const t = (userText || "").toLowerCase();

  // 关键词优先级：用户说了“直飞”就一定 filter
  const wantNonstop =
    t.includes("直飞") || t.includes("nonstop") || t.includes("direct");

  // 排序偏好
  // 默认：价格最低（对现金票最合理）
  let sortBy = "price"; // price | stops | earliest_arrival | earliest_departure | duration

  if (t.includes("转机最少") || t.includes("stop最少") || t.includes("stops least") || t.includes("少转机")) {
    sortBy = "stops";
  } else if (t.includes("最早到") || t.includes("earliest arrival") || t.includes("早点到")) {
    sortBy = "earliest_arrival";
  } else if (t.includes("最早飞") || t.includes("earliest departure") || t.includes("早点出发")) {
    sortBy = "earliest_departure";
  } else if (t.includes("最短") || t.includes("duration") || t.includes("时间最短") || t.includes("飞行时间最短")) {
    sortBy = "duration";
  } else if (t.includes("价格最低") || t.includes("最便宜") || t.includes("lowest price") || t.includes("cheapest")) {
    sortBy = "price";
  }

  // 如果 queryParams.nonstop=true，也等同 wantNonstop
  const nonstop = wantNonstop || !!queryParams.nonstop;

  return { sortBy, nonstop };
}

function formatResults(queryParams, results, meta = {}) {
  const header =
    `已解析 ✅\n` +
    `from=${queryParams.from}, to=${queryParams.to}, date=${queryParams.date}, ` +
    `pax=${queryParams.passengers}, cabin=${queryParams.cabin}, nonstop=${queryParams.nonstop}\n`;

  if (!results || results.length === 0) {
    return header + `\n没找到结果。`;
  }

  const pref = inferPreference(meta.userText, queryParams);

  // enrich results with computed fields
  const enriched = results.map(r => {
    const s = summarize(r.segments || []);
    const price = Number(r.cashTotal ?? Infinity);
    const duration = (s.depMs !== null && s.arrMs !== null) ? (s.arrMs - s.depMs) : Infinity;
    return { r, s, price, duration };
  });

  // filter by nonstop if requested
  let filtered = enriched;
  if (pref.nonstop) {
    filtered = enriched.filter(x => x.s.stops === 0);
  }

  // if nonstop filter makes it empty, fall back (user still wants something)
  const used = filtered.length ? filtered : enriched;

  // sort
  used.sort((a, b) => {
    switch (pref.sortBy) {
      case "stops":
        return a.s.stops - b.s.stops || a.price - b.price;
      case "earliest_arrival":
        return (a.s.arrMs ?? Infinity) - (b.s.arrMs ?? Infinity) || a.price - b.price;
      case "earliest_departure":
        return (a.s.depMs ?? Infinity) - (b.s.depMs ?? Infinity) || a.price - b.price;
      case "duration":
        return a.duration - b.duration || a.price - b.price;
      case "price":
      default:
        return a.price - b.price || a.s.stops - b.s.stops;
    }
  });

  // how many to show: default 3 (更符合“满足 criteria 的结果”)
  const N = meta.topN ?? 3;

  const lines = used.slice(0, N).map((x, idx) => {
    const { route, dep, arr, stops, carriers } = x.s;
    const directTag = stops === 0 ? "直飞" : `${stops}转`;
    const priceStr = `${x.r.currency || "USD"} ${fmtMoney(x.r.cashTotal)}`;
    return `${idx + 1}. ${route} | ${directTag} | ${dep}→${arr} | ${carriers} | ${priceStr}`;
  });

  const prefText = `偏好：${pref.nonstop ? "直飞优先 + " : ""}${
    pref.sortBy === "price" ? "价格最低" :
    pref.sortBy === "stops" ? "转机最少" :
    pref.sortBy === "earliest_arrival" ? "最早到" :
    pref.sortBy === "earliest_departure" ? "最早飞" :
    "最短时间"
  }`;

  const footer =
    `\n${prefText}` +
    (meta.cacheHit ? `\n（来自缓存 ✅）` : ``) +
    `\n你也可以说：\`转机最少\` / \`价格最低\` / \`直飞\` / \`最早到\``;

  return header + `\nTop ${Math.min(N, used.length)}:\n` + lines.join("\n") + footer;
}

function parseMs(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

function summarize(segments = []) {
  if (!segments.length) return { stops: 999, depMs: null, arrMs: null };
  const first = segments[0];
  const last = segments[segments.length - 1];
  const stops = Math.max(0, segments.length - 1);
  return { stops, depMs: parseMs(first.dep), arrMs: parseMs(last.arr) };
}

// 复用你之前的 inferPreference（如果你已有，就别重复定义）
// 这里假设你 format.js 里已经有 inferPreference(userText, queryParams)

function enrich(results) {
  return (results || []).map(r => {
    const s = summarize(r.segments || []);
    const price = Number(r.cashTotal ?? Infinity);
    const duration = (s.depMs != null && s.arrMs != null) ? (s.arrMs - s.depMs) : Infinity;
    return { r, s, price, duration };
  });
}

function pickBest(enriched, pref) {
  let arr = enriched;

  if (pref.nonstop) {
    const nonstopOnly = enriched.filter(x => x.s.stops === 0);
    if (nonstopOnly.length) arr = nonstopOnly;
  }

  const sorted = [...arr].sort((a, b) => {
    switch (pref.sortBy) {
      case "stops":
        return a.s.stops - b.s.stops || a.price - b.price;
      case "earliest_arrival":
        return (a.s.arrMs ?? Infinity) - (b.s.arrMs ?? Infinity) || a.price - b.price;
      case "earliest_departure":
        return (a.s.depMs ?? Infinity) - (b.s.depMs ?? Infinity) || a.price - b.price;
      case "duration":
        return a.duration - b.duration || a.price - b.price;
      case "price":
      default:
        return a.price - b.price || a.s.stops - b.s.stops;
    }
  });

  return sorted[0] || null;
}

function bestSignature(best) {
  if (!best) return null;
  const r = best.r;
  const s0 = r.segments?.[0];
  const sl = r.segments?.[r.segments.length - 1];
  return JSON.stringify({
    price: r.cashTotal,
    cur: r.currency,
    from: s0?.from,
    to: sl?.to,
    dep: s0?.dep,
    arr: sl?.arr,
    stops: best.s.stops,
  });
}

// 越小越好（用于比较“更满足 criteria”）
function bestScore(best, pref) {
  if (!best) return Infinity;
  switch (pref.sortBy) {
    case "stops":
      return best.s.stops * 1e9 + best.price; // stops 优先，再比价格
    case "earliest_arrival":
      return (best.s.arrMs ?? Infinity);
    case "earliest_departure":
      return (best.s.depMs ?? Infinity);
    case "duration":
      return best.duration;
    case "price":
    default:
      // 如果直飞优先，这里已经通过 pickBest 的过滤实现了偏好
      return best.price;
  }
}

module.exports = {
  // 你原本已有的导出保持
  formatResults,
  // 新增导出
  enrich,
  pickBest,
  bestSignature,
  bestScore,
  inferPreference, // 如果你原本就有
};