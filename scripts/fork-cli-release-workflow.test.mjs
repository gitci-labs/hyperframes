import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const workflow = readFileSync(
  new URL("../.github/workflows/fork-cli-release.yml", import.meta.url),
  "utf8",
);
const config = parse(workflow);
const release = config.jobs.release;
const steps = release.steps;
const step = (name) => steps.find((candidate) => candidate.name === name);

test("fork publishing is isolated to versioned gitci tags and repository", () => {
  assert.deepEqual(config.on.push.tags, ["v*-gitci.*"]);
  assert.equal(config.on.workflow_dispatch.inputs.tag.required, true);
  assert.equal(release.if, "github.repository == 'gitci-labs/hyperframes'");
  assert.equal(release.permissions.contents, "write");
  assert.equal(release.env.FORK_REPOSITORY, "gitci-labs/hyperframes");
});

test("fork publishing uses an immutable tag checkout", () => {
  const checkout = steps.find((candidate) => candidate.uses?.startsWith("actions/checkout@"));
  assert.equal(checkout.with["fetch-depth"], 0);
  assert.equal(
    checkout.with.ref,
    "${{ github.event_name == 'workflow_dispatch' && inputs.tag || github.sha }}",
  );
  assert.match(
    step("Verify immutable tagged checkout").run,
    /refs\/tags\/\$RELEASE_TAG\^\{commit\}/,
  );
});

test("the CLI dependencies are built before tests, packaging, and upload", () => {
  const orderedSteps = [
    "Stamp fork version and provenance",
    "Build CLI and runtime dependencies",
    "Test CLI",
    "Verify built CLI identity",
    "Prepare unscoped package manifest",
    "Pack and verify release tarball",
    "Smoke-test packed CLI identity",
    "Create or update GitHub release",
  ];
  const positions = orderedSteps.map((name) => steps.indexOf(step(name)));

  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
  );
  assert.match(
    step("Stamp fork version and provenance").run,
    /prepare-fork-cli-release\.mjs stamp/,
  );
  assert.match(step("Prepare unscoped package manifest").run, /prepare-fork-cli-release\.mjs pack/);
  assert.match(step("Create or update GitHub release").run, /gh release upload[\s\S]*--clobber/);
});
