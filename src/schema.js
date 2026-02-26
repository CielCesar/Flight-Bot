const { z } = require("zod");

const CabinEnum = z.enum(["economy", "premium_economy", "business", "first"]);

const toInt = (v) => {
  // 允许 "2" / 2 / true(->1) / false(->0)
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : v;
  }
  return v;
};

const QueryParamsSchema = z.object({
  from: z.string().min(2),
  to: z.string().min(2),
  date: z.string().min(2),

  passengers: z.preprocess(
    toInt,
    z.number().int().min(1).max(9).default(1)
  ),

  cabin: CabinEnum.default("economy"),

  nonstop: z.preprocess(
    (v) => (typeof v === "string" ? v.toLowerCase() === "true" : v),
    z.boolean().default(false)
  ),

  flexibleDays: z.preprocess(
    toInt,
    z.number().int().min(0).max(7).default(0)
  ),
});

module.exports = { QueryParamsSchema }