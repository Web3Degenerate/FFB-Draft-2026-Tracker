/* global chrome */
const DEFAULT_BASE_URL = "http://localhost:3001";
const input = document.getElementById("app-base-url");
const result = document.getElementById("result");

function normalize(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("Use an http://localhost or http://127.0.0.1 URL.");
  }
  return url.origin;
}

async function load() {
  const settings = await chrome.storage.sync.get({ appBaseUrl: DEFAULT_BASE_URL });
  input.value = settings.appBaseUrl;
}

async function save() {
  try {
    const appBaseUrl = normalize(input.value.trim());
    await chrome.storage.sync.set({ appBaseUrl });
    input.value = appBaseUrl;
    result.className = "success";
    result.textContent = "Saved.";
    return appBaseUrl;
  } catch (error) {
    result.className = "error";
    result.textContent = error instanceof Error ? error.message : String(error);
    return null;
  }
}

document.getElementById("save").addEventListener("click", save);
document.getElementById("test").addEventListener("click", async () => {
  const appBaseUrl = await save();
  if (!appBaseUrl) return;
  result.className = "";
  result.textContent = "Testing…";
  const response = await chrome.runtime.sendMessage({ type: "test-connection", baseUrl: appBaseUrl });
  result.className = response.ok ? "success" : "error";
  result.textContent = response.ok ? `Connected to ${response.baseUrl}.` : response.error;
});

void load();
