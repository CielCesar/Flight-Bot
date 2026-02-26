const { QueryParamsSchema } = require("./schema");
const { extractQueryParams } = require("./llm/openai");

function safeJsonParse(s) {
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch (e) {
    return { ok: false, error: e };
  }
}

async function planQueryFromText(text, cfg) {
  // 第一次抽取
  const raw = await extractQueryParams({ text, model: cfg.model });
  let parsed = safeJsonParse(raw);

  // 如果不是 JSON，重试一次让它只吐 JSON
  if (!parsed.ok) {
    const raw2 = await extractQueryParams({
      text: `Output ONLY valid JSON for this request: ${text}`,
      model: cfg.model,
    });
    parsed = safeJsonParse(raw2);
    if (!parsed.ok) {
      return {
        type: "clarify",
        question: "我没能稳定解析你的需求。请按示例发：`SFO -> HND, 2026-03-04, 2人, 商务`",
      };
    }
  }

  // 如果模型直接要求澄清
  if (parsed.value && parsed.value.need_clarification) {
    return validateOrClarify(parsed.value);
  }

  // 先跑一次校验
  const first = QueryParamsSchema.safeParse(parsed.value);
  if (first.success) {
    return { type: "planned", queryParams: first.data };
  }

  // 自动重试：把缺失字段明确告诉模型
  const missingKeys = new Set(first.error.issues.map((i) => i.path?.[0]).filter(Boolean));
  const missingList = Array.from(missingKeys).join(", ");

  const raw3 = await extractQueryParams({
    text:
      `The previous JSON is missing/invalid fields: ${missingList}. ` +
      `Please output ONLY JSON matching keys {from,to,date,passengers,cabin,nonstop,flexibleDays}. ` +
      `Original request: ${text}`,
    model: cfg.model,
  });

  const parsed3 = safeJsonParse(raw3);
  if (!parsed3.ok) {
    return validateOrClarify(parsed.value); // fallback：走用户友好澄清
  }

  // 再校验一次：成功就用，失败就给用户友好提示
  const second = QueryParamsSchema.safeParse(parsed3.value);
  if (second.success) {
    return { type: "planned", queryParams: second.data };
  }

  // 最终：用户友好澄清（内部错误打印在 validateOrClarify 里）
  return validateOrClarify(parsed3.value);
}

function validateOrClarify(obj) {
  // 1) 模型明确说要追问
  if (obj && obj.need_clarification) {
    return {
      type: "clarify",
      question: obj.question || "我还缺一点信息：出发地/目的地/日期。你能补充一下吗？",
    };
  }

  // 2) schema 校验
  const res = QueryParamsSchema.safeParse(obj);
  if (!res.success) {
    // 只打印到日志（开发用）
    console.error("Zod validation error:", res.error.issues, "raw obj:", obj);

    // 生成用户友好提示：告诉他缺哪些字段
    const missing = new Set();
    for (const issue of res.error.issues) {
      const key = issue.path?.[0];
      if (key) missing.add(key);
    }

    const needs = [];
    if (missing.has("from")) needs.push("出发地（如 SFO）");
    if (missing.has("to")) needs.push("目的地（如 HND/NRT）");
    if (missing.has("date")) needs.push("日期（如 2026-03-04）");

    const hint =
      "我没识别出 " +
      (needs.length ? needs.join("、") : "关键信息") +
      "。\n" +
      "你可以这样发：`SFO -> HND, 2026-03-04, 2人, 商务`";

    return { type: "clarify", question: hint };
  }

  return { type: "planned", queryParams: res.data };
}

module.exports = { planQueryFromText };