"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type Platform = "unix" | "windows";

const INSTALL_COMMANDS: Record<Platform, string> = {
  unix: "curl -fsSL https://liveport.dev/cli | sh",
  windows: "irm https://liveport.dev/install.ps1 | iex",
};

export function InstallCommand() {
  const [platform, setPlatform] = useState<Platform>("unix");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(INSTALL_COMMANDS[platform]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-2xl">
      {/* Platform Tabs */}
      <div className="flex gap-2 mb-2">
        <button
          onClick={() => setPlatform("unix")}
          className={`px-4 py-2 text-sm font-medium border transition-colors ${
            platform === "unix"
              ? "bg-background text-foreground border-border"
              : "bg-transparent text-muted-foreground border-transparent hover:text-foreground"
          }`}
        >
          MACOS / LINUX
        </button>
        <button
          onClick={() => setPlatform("windows")}
          className={`px-4 py-2 text-sm font-medium border transition-colors ${
            platform === "windows"
              ? "bg-background text-foreground border-border"
              : "bg-transparent text-muted-foreground border-transparent hover:text-foreground"
          }`}
        >
          WINDOWS
        </button>
      </div>

      {/* Command Box */}
      <div className="bg-black border border-border p-4 flex items-center justify-between gap-4 group">
        <div className="flex items-center gap-3 font-mono text-sm overflow-x-auto">
          <span className="text-primary shrink-0">{">"}</span>
          <code className="text-foreground whitespace-nowrap">
            {INSTALL_COMMANDS[platform]}
          </code>
        </div>
        <button
          onClick={handleCopy}
          className="shrink-0 p-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Copy to clipboard"
        >
          {copied ? (
            <Check className="h-4 w-4 text-primary" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
