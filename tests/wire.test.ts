import { strict as assert } from "node:assert";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { CefenseClient } from "../src/core/client.js";
import { CefenseError } from "../src/core/errors.js";

let server: Server;
let apiUrl = "";
let reply: { status: number; body: Record<string, unknown> } = { status: 200, body: {} };

before(async () => {
  server = createServer((_req, res) => {
    res.writeHead(reply.status, { "content-type": "application/json" });
    res.end(JSON.stringify(reply.body));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
});

function client(): CefenseClient {
  return new CefenseClient({
    apiUrl,
    credentials: {
      accessToken: "token",
      refreshToken: null,
      expiresAt: null,
      subject: null,
      email: null,
      clientId: "test",
      issuer: "test",
    },
  });
}

async function failure(): Promise<CefenseError> {
  try {
    await client().billingPortal();
  } catch (error) {
    assert.ok(error instanceof CefenseError);
    return error;
  }
  assert.fail("the request was expected to fail");
}

test("a reconnect names the host the API reported, not one guessed from the message", async () => {
  reply = {
    status: 409,
    body: { error: "GitLab connection unavailable, reconnect GitLab.", code: "provider_reconnect", provider: "gitlab" },
  };
  const error = await failure();
  assert.equal(error.code, "provider_reconnect_required");
  assert.equal(error.remedy, "Reconnect it with cf provider connect gitlab.");
});

test("a rate limit carries the wait the API asked for", async () => {
  reply = { status: 429, body: { error: "Too many requests.", code: "rate_limited", retryAfterSeconds: 12 } };
  const error = await failure();
  assert.equal(error.code, "rate_limited");
  assert.equal(error.remedy, "Wait 12 seconds, then retry once.");
});

test("a Clerk outage is not reported as an expired session", async () => {
  reply = { status: 503, body: { error: "Sign-in is briefly unavailable.", code: "auth_unavailable" } };
  const error = await failure();
  assert.equal(error.code, "auth_unavailable");
});
