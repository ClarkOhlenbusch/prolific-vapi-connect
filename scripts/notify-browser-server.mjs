#!/usr/bin/env node
import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.NOTIFY_PORT || 8085);
const HOST = process.env.NOTIFY_HOST || "127.0.0.1";

/** @type {Set<http.ServerResponse>} */
const clients = new Set();

const isLoopback = (req) => {
  const addr = req.socket.remoteAddress || "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
};

const sendEvent = (type, data) => {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      // ignore; will be cleaned up on close
    }
  }
};

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Codex Notify</title>
    <style>
      :root { color-scheme: light dark; }
      body { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; margin: 24px; }
      .card { max-width: 720px; border: 1px solid rgba(127,127,127,.35); border-radius: 12px; padding: 16px; }
      button { font: inherit; padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(127,127,127,.45); background: transparent; cursor: pointer; }
      button:disabled { opacity: .6; cursor: not-allowed; }
      .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
      .small { opacity: .75; font-size: 12px; }
      pre { white-space: pre-wrap; word-break: break-word; font-size: 12px; }
      .status { padding: 6px 10px; border-radius: 999px; border: 1px solid rgba(127,127,127,.35); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Codex Notify</h1>
      <p class="small">Keep this tab open. Click once to enable audio. Then Codex can trigger “done” / “question” notifications via localhost.</p>
      <div class="row">
        <button id="enable">Enable sound</button>
        <span id="enabled" class="status">sound: locked</span>
        <span id="conn" class="status">sse: connecting</span>
      </div>
      <div class="row" style="margin-top: 10px;">
        <button id="testDone" disabled>Test: done</button>
        <button id="testQuestion" disabled>Test: question</button>
      </div>
      <p class="small" style="margin-top: 12px;">CLI trigger examples:</p>
      <pre>./scripts/notify-browser.sh done
./scripts/notify-browser.sh question</pre>
      <p class="small">Last event:</p>
      <pre id="last">(none)</pre>
    </div>
    <script>
      let audioCtx = null;
      let soundEnabled = false;

      const $ = (id) => document.getElementById(id);
      const setStatus = (el, text) => { el.textContent = text; };

      function beep(patternMs) {
        if (!audioCtx) return;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = "sine";
        o.frequency.value = 880;
        g.gain.value = 0.0001;
        o.connect(g); g.connect(audioCtx.destination);
        const t0 = audioCtx.currentTime;
        o.start(t0);
        // Ramp up quickly, then down.
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + (patternMs / 1000));
        o.stop(t0 + (patternMs / 1000) + 0.02);
      }

      function speak(text) {
        try {
          if (!("speechSynthesis" in window)) return;
          const u = new SpeechSynthesisUtterance(text);
          u.rate = 1.0;
          u.pitch = 1.0;
          u.volume = 1.0;
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(u);
        } catch {}
      }

      function notify(mode) {
        const phrase = mode === "done" ? "I'm done." : "I have a question.";
        if (soundEnabled) {
          // Distinct beep patterns
          beep(mode === "done" ? 180 : 380);
          setTimeout(() => beep(mode === "done" ? 120 : 240), mode === "done" ? 220 : 420);
          speak(phrase);
        }
        $("last").textContent = JSON.stringify({ mode, phrase, at: new Date().toISOString() }, null, 2);
      }

      $("enable").addEventListener("click", async () => {
        try {
          audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
          await audioCtx.resume();
          soundEnabled = true;
          setStatus($("enabled"), "sound: enabled");
          $("testDone").disabled = false;
          $("testQuestion").disabled = false;
          notify("done");
        } catch (e) {
          console.error(e);
          setStatus($("enabled"), "sound: failed");
        }
      });

      $("testDone").addEventListener("click", () => notify("done"));
      $("testQuestion").addEventListener("click", () => notify("question"));

      const es = new EventSource("/events");
      es.addEventListener("open", () => setStatus($("conn"), "sse: connected"));
      es.addEventListener("error", () => setStatus($("conn"), "sse: error/retrying"));
      es.addEventListener("notify", (ev) => {
        try {
          const data = JSON.parse(ev.data || "{}");
          if (data && (data.mode === "done" || data.mode === "question")) notify(data.mode);
        } catch {}
      });
    </script>
  </body>
</html>`;

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end("Bad Request");
    return;
  }

  if (!isLoopback(req)) {
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  const u = new URL(req.url, `http://${HOST}:${PORT}`);
  if (u.pathname === "/" && req.method === "GET") {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(html);
    return;
  }

  if (u.pathname === "/events" && req.method === "GET") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
    });
    res.write("event: hello\ndata: {}\n\n");
    clients.add(res);

    const ping = setInterval(() => {
      try {
        res.write("event: ping\ndata: {}\n\n");
      } catch {}
    }, 15000);

    req.on("close", () => {
      clearInterval(ping);
      clients.delete(res);
      try { res.end(); } catch {}
    });
    return;
  }

  if (u.pathname === "/notify" && req.method === "POST") {
    const mode = u.searchParams.get("mode") || "";
    if (mode !== "done" && mode !== "question") {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "mode must be done|question" }));
      return;
    }
    sendEvent("notify", { mode, at: new Date().toISOString() });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not Found");
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`notify server listening on http://${HOST}:${PORT}`);
});

