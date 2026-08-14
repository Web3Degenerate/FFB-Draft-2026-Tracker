/* global chrome */
const title = document.getElementById("status-title");
const message = document.getElementById("status-message");
const dot = document.getElementById("status-dot");
const baseUrl = document.getElementById("base-url");
const warning = document.getElementById("warning");

async function render() {
  const status = await chrome.runtime.sendMessage({ type: "get-status" });
  const labels = { connected: "Connected", unreachable: "App unreachable", idle: "Waiting for draft" };
  title.textContent = labels[status.state] || "Waiting for draft";
  message.textContent = status.message || "Open an ESPN auction draft to connect.";
  dot.className = status.state || "idle";
  baseUrl.textContent = status.baseUrl;
  const skipped = status.skipped || [];
  warning.hidden = skipped.length === 0;
  warning.textContent = skipped.length ? `${skipped.length} sale${skipped.length === 1 ? "" : "s"} need review: ${skipped[0].reason}` : "";
}

document.getElementById("open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());
void render();
