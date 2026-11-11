// The Browser node against a real headless Chrome and a local test site:
// JavaScript pages, Run Steps (type, select, click, page change), steps an
// AI Agent writes, the element list, and the private-address block.
//
//   npx tsx --conditions=react-server scripts/test-browser-node.ts
//
// Needs Chrome or Chromium: CHROME_PATH, or a usual install location. CI
// runs it in the "Browser node" job. Nothing here touches a database or a
// network outside this machine. Chrome gets a fresh temporary profile and is
// killed when the script ends, at the latest after BROWSER_TEST_KILL_SECONDS
// (default 90).

import assert from "node:assert/strict";
import { execSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.ENCRYPTION_KEY ??= "test-key-for-browser-node-tests";

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  `${process.env.LOCALAPPDATA ?? ""}/Google/Chrome/Application/chrome.exe`,
].filter((path): path is string => Boolean(path));

const PORT = 9333;
const KILL_SECONDS = Number(process.env.BROWSER_TEST_KILL_SECONDS) || 90;
const PROFILE_PREFIX = "rxj-browser-node-test-";

// The test site. Every page builds its content with JavaScript.
const site = createServer((req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  const url = new URL(req.url ?? "/", "http://localhost");

  if (url.pathname === "/welcome") {
    res.end(`<!doctype html><html><head><title>Welcome</title></head><body><main id="app"></main>
<script>
  const q = new URLSearchParams(location.search);
  const p = document.createElement("p");
  p.id = "welcome";
  p.textContent = "Welcome " + q.get("name") + " on " + q.get("plan");
  document.getElementById("app").appendChild(p);
</script></body></html>`);
    return;
  }

  res.end(`<!doctype html><html><head><title>Sign up</title></head><body>
<main id="app"></main>
<script>
  document.getElementById("app").innerHTML =
    '<h1>Products</h1><p>Rendered by JavaScript.</p>' +
    '<a href="/welcome?name=link&plan=none">A link</a>' +
    '<input id="name" placeholder="Your name">' +
    '<input name="secret" type="password">' +
    '<select id="plan"><option value="basic">Basic</option><option value="pro">Pro</option></select>' +
    '<button id="go">Sign up</button>';
  document.getElementById("go").onclick = () => {
    location.href = "/welcome?name=" + encodeURIComponent(document.getElementById("name").value) +
      "&plan=" + document.getElementById("plan").value;
  };
</script></body></html>`);
});

let passed = 0;
let failed = 0;
const check = async (name: string, fn: () => unknown) => {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL  ${name}\n      ${(error as Error).message.split("\n").slice(0, 4).join("\n      ")}`);
  }
};

const main = async () => {
  const chromePath = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!chromePath) throw new Error("No Chrome found. Set CHROME_PATH.");

  // The app code first, so Chrome does not wait for it
  process.env.BROWSER_CDP_URL = `http://127.0.0.1:${PORT}`;
  const { browserExecutor, readSteps } = await import("../src/features/executions/components/apps/browser");
  const { listPageElements } = await import("../src/lib/browser");
  void listPageElements;

  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(site.address() as { port: number }).port}`;

  const profile = mkdtempSync(join(tmpdir(), PROFILE_PREFIX));
  const chrome = spawn(
    chromePath,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-dev-shm-usage",
      // CI runners do not allow Chrome's sandbox
      ...(process.platform === "linux" ? ["--no-sandbox"] : []),
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  let stopped = false;
  const stopChrome = () => {
    if (stopped) return;
    stopped = true;
    if (process.platform === "win32") {
      try { execSync(`taskkill /PID ${chrome.pid} /T /F`, { stdio: "ignore" }); } catch {}
      spawnSync("powershell", ["-NoProfile", "-Command", `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${PROFILE_PREFIX}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: "ignore", timeout: 10_000 });
    } else {
      chrome.kill("SIGKILL");
    }
    site.close();
    setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 500);
  };
  const hardKill = setTimeout(() => {
    console.error(`FAIL  hard time limit (${KILL_SECONDS} s)`);
    stopChrome();
    setTimeout(() => process.exit(1), 1000);
  }, KILL_SECONDS * 1000);

  try {
    for (let i = 0; ; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break;
      } catch {}
      if (i > 100) throw new Error("Chrome did not start");
      await new Promise((r) => setTimeout(r, 150));
    }

    const fakeStep = { run: async (_id: string, fn: () => unknown) => fn() } as never;
    type Out = { browser: { content: string; title: string; url: string; elements?: { selector: string; tag: string; text?: string; type?: string }[] } };
    const run = async (data: Record<string, string>, ai?: Record<string, unknown>) =>
      (await browserExecutor({
        data,
        nodeId: "n1",
        userId: "u1",
        context: { json: { name: 'RXJ "ci"', secret: "s3cret" }, ...(ai ? { ai } : {}) },
        step: fakeStep,
        allNodes: [],
        connections: [],
      } as never)) as unknown as Out;

    console.log("Browser node (real Chrome)");

    await check("a private address is refused by default", async () => {
      delete process.env.ALLOW_PRIVATE_NETWORK_REQUESTS;
      await assert.rejects(run({ operation: "content", url: base }), /private or local addresses/);
    });

    // The test site is on this machine: allowed from here on
    process.env.ALLOW_PRIVATE_NETWORK_REQUESTS = "true";

    await check("Get Page Content reads what JavaScript rendered, and lists the elements", async () => {
      const out = await run({ operation: "content", url: base, format: "markdown", listElements: "true" });
      assert.match(out.browser.content, /Rendered by JavaScript/);
      assert.equal(out.browser.title, "Sign up");
      const selectors = (out.browser.elements ?? []).map((element) => element.selector);
      for (const expected of ["#name", "#plan", "#go", 'input[name="secret"]']) {
        assert.ok(selectors.includes(expected), `${expected} in ${selectors.join(", ")}`);
      }
      assert.equal(out.browser.elements?.find((element) => element.type === "password")?.text, undefined);
    });

    await check("Run Steps: type (with quotes from {{...}}), select, click, follow the page change", async () => {
      const out = await run({
        operation: "steps",
        url: base,
        format: "text",
        steps: JSON.stringify([
          { action: "type", selector: "#name", text: "{{json.name}}" },
          { action: "select", selector: "#plan", value: "pro" },
          { action: "click", selector: "#go" },
          { action: "waitForNavigation" },
          { action: "waitFor", selector: "#welcome" },
        ]),
      });
      assert.match(out.browser.content, /Welcome RXJ "ci" on pro/);
      assert.match(out.browser.url, /\/welcome\?/);
    });

    await check("Run Steps written by an AI Agent: read as the model wrote it, never rendered again", async () => {
      const modelSteps = JSON.stringify([
        { action: "type", selector: "#name", text: "{{json.secret}}" },
        { action: "press", key: "Tab" },
        { action: "click", selector: "#go" },
        { action: "waitFor", selector: "#welcome" },
      ]);
      const out = await run(
        { operation: "steps", url: base, format: "text", steps: '{{$fromAI "steps" "The browser actions as a JSON list"}}' },
        { steps: modelSteps }
      );
      // The model's {{json.secret}} is typed as text, not filled in
      assert.match(out.browser.content, /Welcome \{\{json\.secret\}\} on basic/);
      assert.doesNotMatch(out.browser.content, /s3cret/);
    });

    await check("a step that fails names its number", async () => {
      await assert.rejects(
        run({ operation: "steps", url: base, timeout: "5", steps: JSON.stringify([{ action: "click", selector: "#missing" }]) }),
        /step 1 \(click\) failed|took longer than the node's Timeout/
      );
    });

    await check("bad steps fail before a browser is opened", async () => {
      assert.throws(() => readSteps('[{"action":"press","key":"F12"}]', (text) => text), /not allowed/);
      await assert.rejects(run({ operation: "steps", url: base, steps: '{{$fromAI "steps"}}' }, { steps: "click the button" }), /JSON list/);
    });
  } finally {
    clearTimeout(hardKill);
    stopChrome();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  setTimeout(() => process.exit(failed ? 1 : 0), 800);
};

main().catch((error) => {
  console.error(error);
  setTimeout(() => process.exit(1), 800);
});
