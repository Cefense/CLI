import { strict as assert } from "node:assert";
import { test } from "node:test";
import { matchProject, parseGithubRemote, parseRepoArgument } from "../src/core/repo.js";
import type { Project } from "../src/core/types.js";

test("parseGithubRemote handles every remote form git writes", () => {
  const expected = { owner: "cefense", name: "backend", fullName: "cefense/backend" };
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
