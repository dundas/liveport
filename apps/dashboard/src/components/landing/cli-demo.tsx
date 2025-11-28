"use client";

import { useEffect, useState } from "react";

function useTypewriter(text: string, speed = 50) {
  const [displayedText, setDisplayedText] = useState("");
  const [i, setI] = useState(0);

  useEffect(() => {
    if (i < text.length) {
      const timer = setTimeout(() => {
        setDisplayedText(text.substring(0, i + 1));
        setI(i + 1);
      }, speed);
      return () => clearTimeout(timer);
    }
  }, [text, i, speed]);

  return displayedText;
}

export function CliDemo() {
  const cliCommand = useTypewriter("liveport connect 3000_");

  return (
    <div className="bg-black border border-border p-6 max-w-2xl mb-12 shadow-[8px_8px_0_var(--color-border)]">
      <div className="flex items-center gap-3 text-sm mb-2 font-mono">
        <span className="text-primary">$</span>
        <span className="text-foreground">npm install -g @liveport/cli</span>
      </div>
      <div className="flex items-center gap-3 text-sm font-mono">
        <span className="text-primary">$</span>
        <span className="text-foreground animate-pulse">{cliCommand}</span>
      </div>
    </div>
  );
}
