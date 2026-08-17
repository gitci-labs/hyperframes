import { memo, useState } from "react";
import { copyTextToClipboard } from "../../utils/clipboard";
import type { FfmpegStatus } from "./useFfmpegStatus";

const DOWNLOAD_URL = "https://ffmpeg.org/download.html";

/**
 * Shown above Export when the dev server reports no usable FFmpeg.
 *
 * This exists because the failure it replaces was the single most reported
 * Studio problem: the user built a composition, pressed Export, and got
 * "Server error (503)". The encoder had never been installed, the server knew
 * that, and nothing said so. Saying it before the work starts, with a command
 * they can paste, is the whole point — so the command is the loudest element
 * here, not the apology.
 */
export const FfmpegRequiredNotice = memo(function FfmpegRequiredNotice({
  status,
  checking,
  onRecheck,
}: {
  status: FfmpegStatus;
  checking: boolean;
  onRecheck: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async (command: string) => {
    const ok = await copyTextToClipboard(command);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold text-amber-300">
          {status.title ?? "FFmpeg not found"}
        </span>
        <span className="text-[10px] leading-snug text-panel-text-4">
          {status.detail ?? "FFmpeg is required to encode video. Export cannot run without it."}
        </span>
      </div>

      {status.command ? (
        <div className="flex items-center gap-1.5">
          <code className="flex-1 overflow-x-auto whitespace-nowrap rounded bg-black/40 px-2 py-1 text-[10px] text-panel-text-2">
            {status.command}
          </code>
          <button
            type="button"
            onClick={() => void copy(status.command ?? "")}
            className="h-6 flex-shrink-0 rounded border border-amber-500/30 px-2 text-[10px] font-medium text-amber-200 transition-colors hover:bg-amber-500/20 active:scale-[0.98]"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : (
        status.hint && (
          <span className="text-[10px] leading-snug text-panel-text-3">{status.hint}</span>
        )
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRecheck}
          disabled={checking}
          className="text-[10px] font-medium text-amber-200 underline-offset-2 transition-colors hover:underline disabled:opacity-50"
        >
          {checking ? "Checking…" : "Recheck"}
        </button>
        <a
          href={DOWNLOAD_URL}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-panel-text-4 underline-offset-2 transition-colors hover:text-panel-text-2 hover:underline"
        >
          Other install options
        </a>
      </div>
    </div>
  );
});
