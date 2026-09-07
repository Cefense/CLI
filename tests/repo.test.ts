import { strict as assert } from "node:assert";
import { test } from "node:test";
import { matchProject, parseGitRemote, parseGithubRemote, parseRepoArgument } from "../src/core/repo.js";
import type { Project } from "../src/core/types.js";

test("parseGithubRemote handles every remote form git writes", () => {
  const expected = {
    owner: "cefense",
    name: "backend",
    fullName: "cefense/backend",
    provider: "github",
  };
  for (const url of [
    "git@github.com:cefense/backend.git",
    "git@github.com:cefense/backend",
    "https://github.com/cefense/backend.git",
    "https://github.com/cefense/backend",
    "ssh://git@github.com/cefense/backend.git",
    "https://token@github.com/cefense/backend.git",
  ]) {
    assert.deepEqual(parseGithubRemote(url), expected, url);
  }
});

test("parseGithubRemote rejects remotes that are not GitHub", () => {
  assert.equal(parseGithubRemote("git@gitlab.com:cefense/backend.git"), null);
  assert.equal(parseGithubRemote(""), null);
});

test("parseGitRemote reads the host off the remote", () => {
  assert.equal(parseGitRemote("git@gitlab.com:cefense/backend.git")?.provider, "gitlab");
  assert.equal(parseGitRemote("https://bitbucket.org/cefense/backend")?.provider, "bitbucket");
  assert.equal(parseGitRemote("https://github.com/cefense/backend")?.provider, "github");
  assert.equal(parseGitRemote("https://example.com/cefense/backend"), null);
});

test("parseGitRemote keeps a GitLab subgroup path in the owner", () => {
  const nested = parseGitRemote("git@gitlab.com:acme/platform/backend.git");
  assert.equal(nested?.owner, "acme/platform");
  assert.equal(nested?.name, "backend");
  assert.equal(nested?.fullName, "acme/platform/backend");
});

test("parseRepoArgument accepts owner/name and full URLs", () => {
  assert.equal(parseRepoArgument("cefense/backend")?.fullName, "cefense/backend");
  assert.equal(parseRepoArgument("https://github.com/cefense/backend")?.fullName, "cefense/backend");
  assert.equal(parseRepoArgument("backend"), null);
});

const project = (fullName: string, id: string): Project =>
  ({
    fullName,
    githubRepoId: id,
    name: fullName.split("/")[1]!,
    owner: fullName.split("/")[0]!,
  }) as Project;

test("matchProject resolves by full name, id, and bare name", () => {
  const projects = [project("cefense/backend", "1"), project("cefense/frontend", "2")];
  assert.equal(matchProject(projects, "cefense/frontend")?.githubRepoId, "2");
  assert.equal(matchProject(projects, "CEFENSE/BACKEND")?.githubRepoId, "1");
  assert.equal(matchProject(projects, "2")?.githubRepoId, "2");
  assert.equal(matchProject(projects, "frontend")?.githubRepoId, "2");
  assert.equal(matchProject(projects, "nope"), null);
});
