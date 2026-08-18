#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dirname, "..");
const DEFAULT_MANIFEST = join(ROOT, "packages/cli/package.json");
const FORK_REPOSITORY = "gitci-labs/hyperframes";
const SOURCE_PACKAGE_NAME = "@hyperframes/cli";
const PACKED_PACKAGE_NAME = "hyperframes";
const FORK_VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-gitci\.(?:0|[1-9]\d*)$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

function fail(message) {
  throw new Error(message);
}

export function validateForkRelease({ version, tag, repository, commit }) {
  if (!FORK_VERSION_PATTERN.test(version)) {
    fail(`Fork release version must match <semver>-gitci.<number>; received ${version}`);
  }
  if (tag !== `v${version}`) {
    fail(`Fork release tag must be v${version}; received ${tag}`);
  }
  if (repository !== FORK_REPOSITORY) {
    fail(`Fork releases are restricted to ${FORK_REPOSITORY}; received ${repository}`);
  }
  if (!COMMIT_PATTERN.test(commit)) {
    fail(`Fork release commit must be a full lowercase 40-character Git SHA; received ${commit}`);
  }

  return { version, tag, repository, commit };
}

export function stampForkManifest(manifest, release) {
  validateForkRelease(release);
  if (![SOURCE_PACKAGE_NAME, PACKED_PACKAGE_NAME].includes(manifest.name)) {
    fail(
      `Expected CLI package name ${SOURCE_PACKAGE_NAME} or ${PACKED_PACKAGE_NAME}; received ${manifest.name}`,
    );
  }

  const repositoryUrl = `https://github.com/${release.repository}.git`;
  return {
    ...manifest,
    name: SOURCE_PACKAGE_NAME,
    version: release.version,
    repository: {
      type: "git",
      url: repositoryUrl,
      directory: "packages/cli",
    },
    homepage: `https://github.com/${release.repository}/releases/tag/${release.tag}`,
    gitHead: release.commit,
    hyperframesForkRelease: {
      repository: release.repository,
      tag: release.tag,
      commit: release.commit,
    },
  };
}

export function preparePackedForkManifest(manifest, release) {
  validateForkRelease(release);
  if (manifest.name !== SOURCE_PACKAGE_NAME) {
    fail(`Expected stamped CLI package name ${SOURCE_PACKAGE_NAME}; received ${manifest.name}`);
  }
  if (manifest.version !== release.version) {
    fail(`Stamped CLI version is ${manifest.version}; expected ${release.version}`);
  }

  const provenance = manifest.hyperframesForkRelease;
  if (
    provenance?.repository !== release.repository ||
    provenance?.tag !== release.tag ||
    provenance?.commit !== release.commit ||
    manifest.gitHead !== release.commit
  ) {
    fail("CLI manifest provenance does not match the requested fork release");
  }

  return { ...manifest, name: PACKED_PACKAGE_NAME };
}

function parseArguments(args) {
  const [phase, ...rest] = args;
  if (!new Set(["stamp", "pack"]).has(phase)) {
    fail(
      "Usage: prepare-fork-cli-release.mjs <stamp|pack> --version <version> --tag <tag> --repository <owner/repo> --commit <sha> [--manifest <path>]",
    );
  }

  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith("--") || value == null) {
      fail(`Invalid argument near ${key ?? "<end>"}`);
    }
    const option = key.slice(2);
    if (!["version", "tag", "repository", "commit", "manifest"].includes(option)) {
      fail(`Unknown option ${key}`);
    }
    options[option] = value;
  }

  for (const required of ["version", "tag", "repository", "commit"]) {
    if (!options[required]) fail(`Missing required option --${required}`);
  }

  return {
    phase,
    manifestPath: options.manifest ?? DEFAULT_MANIFEST,
    release: validateForkRelease(options),
  };
}

function main() {
  const { phase, manifestPath, release } = parseArguments(process.argv.slice(2));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const nextManifest =
    phase === "stamp"
      ? stampForkManifest(manifest, release)
      : preparePackedForkManifest(manifest, release);

  writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
  console.log(
    phase === "stamp"
      ? `Stamped ${SOURCE_PACKAGE_NAME}@${release.version} from ${release.repository}@${release.commit}`
      : `Prepared ${PACKED_PACKAGE_NAME}@${release.version} for npm packing`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
