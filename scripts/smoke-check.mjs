// Post-deploy smoke check for the live site (see #34, Testing Decisions).
// Observes only what a browser sees: status codes, redirects and headers.
// Usage: node scripts/smoke-check.mjs [origin]   (default https://3d20.app)
// The "a Roll completes in a real browser" check is done by hand.

const origin = (process.argv[2] ?? "https://3d20.app").replace(/\/$/, "");
const host = new URL(origin).host;

const get = (url) => fetch(url, { redirect: "manual" });

const checks = [
  ["https root returns 200 with the app's HTML", async () => {
    const res = await get(`${origin}/`);
    const body = await res.text();
    assert(res.status === 200, `status ${res.status}`);
    assert(body.includes('id="tray"'), "body is not the dice app");
  }],
  ["http redirects to https", async () => {
    const res = await get(`http://${host}/`);
    assert([301, 302, 307, 308].includes(res.status), `status ${res.status}`);
    assert(res.headers.get("location")?.startsWith(`https://${host}`), `location ${res.headers.get("location")}`);
  }],
  ["www redirects to the apex", async () => {
    const res = await get(`https://www.${host}/`);
    assert([301, 302, 307, 308].includes(res.status), `status ${res.status}`);
    assert(res.headers.get("location")?.replace(/\/$/, "") === origin, `location ${res.headers.get("location")}`);
  }],
  ["index.html is no-cache", async () => {
    const res = await get(`${origin}/`);
    assert(/no-cache/.test(res.headers.get("cache-control") ?? ""), `cache-control ${res.headers.get("cache-control")}`);
  }],
  ["hashed assets are immutable", async () => {
    const html = await (await get(`${origin}/`)).text();
    const asset = html.match(/(?:src|href)="\.?\/?(assets\/[^"]+)"/)?.[1];
    assert(asset, "no hashed asset referenced in index.html");
    const res = await get(`${origin}/${asset}`);
    assert(res.status === 200, `${asset} status ${res.status}`);
    assert(/immutable/.test(res.headers.get("cache-control") ?? ""), `${asset} cache-control ${res.headers.get("cache-control")}`);
  }],
  ["a nonexistent path serves the app", async () => {
    const res = await get(`${origin}/no-such-page-${Date.now()}`);
    const body = await res.text();
    assert(body.includes('id="tray"'), `status ${res.status}, body is not the dice app`);
  }],
  ["responses carry strict-transport-security", async () => {
    const res = await get(`${origin}/`);
    assert(res.headers.get("strict-transport-security"), "header missing");
  }],
];

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

let failed = 0;
for (const [name, check] of checks) {
  try {
    await check();
    console.log(`PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL  ${name}: ${err.cause?.code ?? err.message}`);
  }
}
process.exit(failed ? 1 : 0);
