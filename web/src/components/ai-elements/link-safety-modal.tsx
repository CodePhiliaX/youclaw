import { openExternal } from "@/api/transport";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { useState } from "react";

export const LinkSafetyModal = ({ url, onClose }: { url: string; onClose: () => void }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">Open external link?</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <p className="text-sm text-muted-foreground mb-3">You're about to visit an external website.</p>
        <div className="bg-muted rounded p-3 mb-4 break-all text-sm font-mono">{url}</div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded border border-border hover:bg-muted text-sm"
          >
            {copied ? <CheckIcon className="size-4 text-green-500" /> : <CopyIcon className="size-4" />}
            {copied ? "Copied!" : "Copy link"}
          </button>
          <button
            onClick={() => { openExternal(url); onClose(); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 text-sm"
          >
            <ExternalLinkIcon className="size-4" />
            Open link
          </button>
        </div>
      </div>
    </div>
  );
};
