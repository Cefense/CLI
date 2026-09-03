import { strict as assert } from "node:assert";
import { test } from "node:test";
import { challengeFor, constantTimeEquals, createPkcePair, redirectPorts } from "../src/core/oauth.js";

test("challengeFor matches the RFC 7636 appendix B vector", () => {
  assert.equal(
    challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

test("createPkcePair produces url-safe values of a usable length", () => {
  const { verifier, challenge } = createPkcePair();
  assert.match(verifier, /^[A-Za-z0-9\-_]+$/);
  assert.match(challenge, /^[A-Za-z0-9\-_]+$/);
  assert.ok(verifier.length >= 43 && verifier.length <= 128);
  assert.equal(challenge, challengeFor(verifier));
});

test("createPkcePair does not repeat itself", () => {
  const first = createPkcePair();
  const second = createPkcePair();
  assert.notEqual(first.verifier, second.verifier);
});

test("constantTimeEquals compares without throwing on length mismatch", () => {
  assert.equal(constantTimeEquals("abc", "abc"), true);
  assert.equal(constantTimeEquals("abc", "abd"), false);
  assert.equal(constantTimeEquals("abc", "abcd"), false);
  assert.equal(constantTimeEquals("", ""), true);
});

test("redirectPorts extracts loopback ports in order", () => {
  assert.deepEqual(
    redirectPorts([
      "http://127.0.0.1:8976/callback",
      "http://127.0.0.1:8977/callback",
      "not a url",
      "http://127.0.0.1/callback",
    ]),
    [8976, 8977],
  );
});
