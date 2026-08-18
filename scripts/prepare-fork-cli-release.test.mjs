import assert from "node:assert/strict";
import test from "node:test";
import {
  preparePackedForkManifest,
  stampForkManifest,
  validateForkRelease,
} from "./prepare-fork-cli-release.mjs";

const release = {
  version: "0.7.111-gitci.2",
  tag: "v0.7.111-gitci.2",
  repository: "gitci-labs/hyperframes",
  commit: "0123456789abcdef0123456789abcdef01234567",
};

test("validates the gitci fork release contract", () => {
  assert.deepEqual(validateForkRelease(release), release);
  assert.throws(
    () => validateForkRelease({ ...release, version: "0.7.111" }),
    /must match <semver>-gitci/,
  );
  assert.throws(
    () => validateForkRelease({ ...release, repository: "heygen-com/hyperframes" }),
    /restricted to gitci-labs\/hyperframes/,
  );
  assert.throws(
    () => validateForkRelease({ ...release, tag: "v0.7.111-gitci.3" }),
    /tag must be v0.7.111-gitci.2/,
  );
});

test("stamps the build version and immutable fork provenance", () => {
  const stamped = stampForkManifest(
    {
      name: "@hyperframes/cli",
      version: "0.7.111",
      repository: {
        type: "git",
        url: "https://github.com/heygen-com/hyperframes",
        directory: "packages/cli",
      },
    },
    release,
  );

  assert.equal(stamped.name, "@hyperframes/cli");
  assert.equal(stamped.version, release.version);
  assert.equal(stamped.repository.url, "https://github.com/gitci-labs/hyperframes.git");
  assert.equal(
    stamped.homepage,
    `${stamped.repository.url.replace(/\.git$/, "")}/releases/tag/${release.tag}`,
  );
  assert.equal(stamped.gitHead, release.commit);
  assert.deepEqual(stamped.hyperframesForkRelease, {
    repository: release.repository,
    tag: release.tag,
    commit: release.commit,
  });
});

test("rewrites only a correctly stamped CLI manifest for packing", () => {
  const stamped = stampForkManifest({ name: "@hyperframes/cli" }, release);
  const packed = preparePackedForkManifest(stamped, release);

  assert.equal(packed.name, "hyperframes");
  assert.equal(packed.version, release.version);
  assert.deepEqual(packed.hyperframesForkRelease, stamped.hyperframesForkRelease);
  assert.throws(
    () => preparePackedForkManifest({ ...stamped, gitHead: "f".repeat(40) }, release),
    /provenance does not match/,
  );
});
