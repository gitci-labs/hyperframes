import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findFFmpeg, findFFprobe } from "./ffmpeg.js";

// Only child_process is mocked: the H264 encoder probe shells out, while the
// wrapper tests below resolve via env overrides and need the real `existsSync`.
vi.mock("node:child_process", () => ({ execFileSync: vi.fn(), execSync: vi.fn() }));

const mockExecFile = vi.mocked(execFileSync);

afterEach(() => {
  vi.clearAllMocks();
  delete process.env.HYPERFRAMES_FFMPEG_PATH;
  delete process.env.HYPERFRAMES_FFPROBE_PATH;
});

// Lookup mechanics (PATH scan, common-dir fallback, Windows shim preference)
// are covered by @hyperframes/parsers ffBinaries.test.ts. These tests pin the
// CLI wrapper's contract: a configured-but-missing override means "not found"
// so callers surface the install hint instead of a spawn error.
describe("findFFmpeg / findFFprobe", () => {
  it("returns undefined when the env override points at a missing file", () => {
    process.env.HYPERFRAMES_FFMPEG_PATH = join(tmpdir(), "missing-ffmpeg");
    process.env.HYPERFRAMES_FFPROBE_PATH = join(tmpdir(), "missing-ffprobe");

    expect(findFFmpeg()).toBeUndefined();
    expect(findFFprobe()).toBeUndefined();
  });

  it("returns the configured path when the env override exists", () => {
    process.env.HYPERFRAMES_FFMPEG_PATH = process.execPath;

    expect(findFFmpeg()).toBe(process.execPath);
  });
});

describe("resolveH264EncoderMode", () => {
  it("falls back to VideoToolbox when libx264 is absent", async () => {
    const { resolveH264EncoderMode } = await import("./ffmpeg.js");
    const encoders = `
 V....D h264_videotoolbox    VideoToolbox H.264 Encoder
`;

    expect(resolveH264EncoderMode(encoders, false)).toBe("gpu");
  });

  it("does not treat a compiled Linux hardware encoder as usable", async () => {
    const { resolveH264EncoderMode } = await import("./ffmpeg.js");
    const encoders = `
 V....D h264_vaapi    H.264/AVC (VAAPI)
`;

    expect(() => resolveH264EncoderMode(encoders, false)).toThrow(
      "neither libx264 nor VideoToolbox",
    );
  });

  it("inspects the configured FFmpeg binary", async () => {
    mockExecFile.mockReturnValue(
      " V....D h264_videotoolbox    VideoToolbox H.264 Encoder\n" as never,
    );
    const { detectH264EncoderMode } = await import("./ffmpeg.js");

    expect(detectH264EncoderMode("/custom/ffmpeg", false)).toBe("gpu");
    expect(mockExecFile).toHaveBeenCalledWith(
      "/custom/ffmpeg",
      ["-hide_banner", "-encoders"],
      expect.objectContaining({ encoding: "utf-8" }),
    );
  });
});

// Studio renders the command behind a copy button, so "is there a command at
// all" has to be a typed answer rather than a guess made by pattern-matching
// the prose hint. The hint is derived from the command, so they move together.
describe("getFFmpegInstallCommand / getFFmpegInstallHint", () => {
  const realPlatform = process.platform;

  function setPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, "platform", { value: platform, configurable: true });
  }

  afterEach(() => {
    setPlatform(realPlatform);
  });

  it("gives macOS a pasteable command and uses it verbatim as the hint", async () => {
    setPlatform("darwin");
    const { getFFmpegInstallCommand, getFFmpegInstallHint } = await import("./ffmpeg.js");

    expect(getFFmpegInstallCommand()).toBe("brew install ffmpeg");
    expect(getFFmpegInstallHint()).toBe("brew install ffmpeg");
  });

  it("gives Windows a winget command and keeps the manual route in the hint", async () => {
    setPlatform("win32");
    const { getFFmpegInstallCommand, getFFmpegInstallHint } = await import("./ffmpeg.js");

    const command = getFFmpegInstallCommand();
    expect(command).toBe("winget install --id Gyan.FFmpeg -e");
    // Machines predating winget still need somewhere to go.
    expect(getFFmpegInstallHint()).toContain(command);
    expect(getFFmpegInstallHint()).toContain("https://ffmpeg.org/download.html");
  });

  it("reports no command on a platform without one, and still hints", async () => {
    setPlatform("sunos");
    const { getFFmpegInstallCommand, getFFmpegInstallHint } = await import("./ffmpeg.js");

    expect(getFFmpegInstallCommand()).toBeUndefined();
    expect(getFFmpegInstallHint()).toBe("https://ffmpeg.org/download.html");
  });
});
