const store = new Map();

const DEFAULTS = {
  provider: "openai",
  model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
};

function getUserConfig(userId) {
  if (!store.has(userId)) store.set(userId, { ...DEFAULTS });
  return store.get(userId);
}

function setUserConfig(userId, patch) {
  const cur = getUserConfig(userId);
  store.set(userId, { ...cur, ...patch });
}

module.exports = { getUserConfig, setUserConfig };