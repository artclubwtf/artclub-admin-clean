import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.AUTH_FLOW_BASE_URL;

const run = baseUrl ? test : test.skip;

run("auth flow: register -> me -> logout -> me", async () => {
  const email = `test+${Date.now()}@example.com`;
  const password = "Passw0rd!";
  const name = "Test Customer";

  const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });

  assert.equal(registerRes.status, 201);
  const registerJson = await registerRes.json();
  assert.equal(registerJson.ok, true);
  assert.equal(registerJson.user.email, email.toLowerCase());

  const setCookie = registerRes.headers.get("set-cookie");
  assert.ok(setCookie, "Expected set-cookie header");
  const cookie = setCookie.split(";")[0];

  const meRes = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { cookie },
  });
  assert.equal(meRes.status, 200);
  const meJson = await meRes.json();
  assert.equal(meJson.user.email, email.toLowerCase());

  const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(logoutRes.status, 200);

  const meResAfter = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { cookie },
  });
  assert.equal(meResAfter.status, 401);
});
