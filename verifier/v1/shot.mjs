// CDP-based screenshot helper (verifier tooling, not app code).
// Usage: node shot.mjs <url> <outfile> <width> <height> [dark]
import { execFile } from "node:child_process";

const [url, out, w = "1280", h = "1500", mode = "light"] = process.argv.slice(2);

const chrome = execFile(
  "chromium",
  ["--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", `--window-size=${w},${h}`, "--remote-debugging-port=0", "about:blank"],
  () => {},
);

function waitForDevtools(stderr, timeout = 15000) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const t = setTimeout(() => reject(new Error("devtools url timeout")), timeout);
    stderr.on("data", (d) => {
      buf += d.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) {
        clearTimeout(t);
        resolve(m[1]);
      }
    });
  });
}

const wsUrl = await waitForDevtools(chrome.stderr);
const browser = new WebSocket(wsUrl);
await new Promise((r) => (browser.onopen = r));

let id = 0;
const pending = new Map();
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, { resolve, reject });
    browser.send(JSON.stringify(msg));
  });
browser.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  }
};

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });

await send("Page.enable", {}, sessionId);
await send("Runtime.enable", {}, sessionId);
await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 1, mobile: false }, sessionId);
if (mode === "dark") {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] }, sessionId);
}
await send(
  "Page.addScriptToEvaluateOnNewDocument",
  { source: `try{localStorage.setItem("theme","${mode}")}catch(e){}` },
  sessionId,
);
await send("Page.navigate", { url }, sessionId);

// Wait until data landed: no skeletons left and DOM text stable.
async function evalJs(expr) {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true }, sessionId);
  return r?.result?.value;
}
let settled = false;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const skeletons = await evalJs(`document.querySelectorAll('[data-slot="skeleton"]').length`);
  if (skeletons === 0) {
    settled = true;
    break;
  }
}
console.log(settled ? "settled (no skeletons)" : "WARN: skeletons still present after 60s");
await new Promise((r) => setTimeout(r, 1500)); // charts/recharts settle

const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
const { writeFileSync } = await import("node:fs");
writeFileSync(out, Buffer.from(data, "base64"));
console.log("OK", out);
browser.close();
chrome.kill();
process.exit(0);
