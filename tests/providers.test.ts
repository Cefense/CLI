import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  blobUrl,
  commitUrl,
  parseProvider,
  providerFromRepoId,
  providerOf,
  treeUrl,
} from "../src/core/providers.js";
import { UsageError } from "../src/core/errors.js";

test("parseProvider takes the id or the display name", () => {
  assert.equal(parseProvider("gitlab"), "gitlab");
  assert.equal(parseProvider(" Bitbucket "), "bitbucket");
  assert.equal(parseProvider("GitHub"), "github");
  assert.throws(() => parseProvider("gitea"), UsageError);
});

test("providerFromRepoId reads the namespace off a stored key", () => {
  assert.equal(providerFromRepoId("gitlab:481"), "gitlab");
  assert.equal(providerFromRepoId("bitbucket:{uuid}"), "bitbucket");
  assert.equal(providerFromRepoId("123456"), "github");
});

test("providerOf prefers the explicit host over the key", () => {
  assert.equal(providerOf({ provider: "gitlab", githubRepoId: "gitlab:1" }), "gitlab");
  assert.equal(providerOf({ githubRepoId: "bitbucket:1" }), "bitbucket");
  assert.equal(providerOf({ githubRepoId: "1" }), "github");
});

test("blobUrl anchors lines the way each host does", () => {
  const lines = { start: 10, end: 12 };
  assert.equal(
    blobUrl({ githubRepoId: "1", htmlUrl: "https://github.com/a/b" }, "src/x.ts", "main", lines),
    "https://github.com/a/b/blob/main/src/x.ts#L10-L12",
  );
  assert.equal(
    blobUrl(
      { provider: "gitlab", githubRepoId: "gitlab:1", htmlUrl: "https://gitlab.com/a/b" },
      "src/x.ts",
      "main",
      lines,
    ),
    "https://gitlab.com/a/b/-/blob/main/src/x.ts#L10-12",
  );
  assert.equal(
    blobUrl(
      { provider: "bitbucket", githubRepoId: "bitbucket:1", htmlUrl: "https://bitbucket.org/a/b" },
      "src/x.ts",
      "main",
      lines,
    ),
    "https://bitbucket.org/a/b/src/main/src/x.ts#lines-10:12",
  );
});

test("blobUrl drops the range when a finding is one line", () => {
  assert.equal(
    blobUrl({ githubRepoId: "1", htmlUrl: "https://github.com/a/b" }, "x.ts", "main", {
      start: 4,
      end: 4,
    }),
    "https://github.com/a/b/blob/main/x.ts#L4",
  );
});

test("commit and tree links follow the host's own paths", () => {
  const gitlab = { provider: "gitlab", githubRepoId: "gitlab:1", htmlUrl: "https://gitlab.com/a/b" };
  assert.equal(commitUrl(gitlab, "abc"), "https://gitlab.com/a/b/-/commit/abc");
  assert.equal(treeUrl(gitlab, "main"), "https://gitlab.com/a/b/-/tree/main");

  const bitbucket = {
    provider: "bitbucket",
    githubRepoId: "bitbucket:1",
    htmlUrl: "https://bitbucket.org/a/b",
  };
  assert.equal(commitUrl(bitbucket, "abc"), "https://bitbucket.org/a/b/commits/abc");
  assert.equal(treeUrl(bitbucket, "main"), "https://bitbucket.org/a/b/src/main");
});

test("a repository with no web URL has no links", () => {
  assert.equal(commitUrl({ githubRepoId: "1", htmlUrl: null }, "abc"), null);
  assert.equal(treeUrl({ githubRepoId: "1" }, "main"), null);
});
