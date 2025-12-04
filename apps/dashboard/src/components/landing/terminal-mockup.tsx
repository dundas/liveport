"use client";

import { useEffect, useState } from "react";

const TERMINAL_LINES = [
  { text: "$ liveport connect 3000", delay: 0, type: "command" },
  { text: "", delay: 500, type: "empty" },
  { text: "  ╦  ╦╦  ╦╔═╗╔═╗╔═╗╦═╗╔╦╗", delay: 600, type: "ascii" },
  { text: "  ║  ║╚╗╔╝║╣ ╠═╝║ ║╠╦╝ ║ ", delay: 700, type: "ascii" },
  { text: "  ╩═╝╩ ╚╝ ╚═╝╩  ╚═╝╩╚═ ╩ ", delay: 800, type: "ascii" },
  { text: "", delay: 900, type: "empty" },
  { text: "  Secure localhost tunnels for AI agents", delay: 1000, type: "subtitle" },
  { text: "", delay: 1100, type: "empty" },
  { text: "✓ Tunnel established!", delay: 1500, type: "success" },
  { text: "", delay: 1600, type: "empty" },
  { text: "Public URL: https://swift-fox-a7x2.liveport.online", delay: 1800, type: "url" },
  { text: "Forwarding: → http://localhost:3000", delay: 2000, type: "info" },
  { text: "", delay: 2200, type: "empty" },
  { text: "Press Ctrl+C to disconnect", delay: 2400, type: "hint" },
  { text: "", delay: 2600, type: "empty" },
  { text: "12:34:56 PM  GET  /api/webhook  200  12ms", delay: 3000, type: "log" },
  { text: "12:34:57 PM  POST /api/data    201  45ms", delay: 3500, type: "log" },
  { text: "12:34:58 PM  GET  /health      200   3ms", delay: 4000, type: "log" },
];

export function TerminalMockup() {
  const [visibleLines, setVisibleLines] = useState<number>(0);

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    
    TERMINAL_LINES.forEach((line, index) => {
      const timer = setTimeout(() => {
        setVisibleLines(index + 1);
      }, line.delay);
      timers.push(timer);
    });

    return () => timers.forEach(clearTimeout);
  }, []);

  const getLineClass = (type: string) => {
    switch (type) {
      case "command":
        return "text-foreground";
      case "ascii":
        return "text-primary";
      case "subtitle":
        return "text-muted-foreground";
      case "success":
        return "text-green-500";
      case "url":
        return "text-primary font-bold";
      case "info":
        return "text-muted-foreground";
      case "hint":
        return "text-muted-foreground/50 text-xs";
      case "log":
        return "text-muted-foreground/70";
      default:
        return "text-foreground";
    }
  };

  return (
    <div className="relative w-full max-w-lg">
      {/* Glow effect */}
      <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-primary/5 blur-xl opacity-50" />
      
      {/* Terminal window */}
      <div className="relative bg-black border border-border rounded-lg overflow-hidden shadow-2xl">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-black/50 border-b border-border">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <span className="text-xs text-muted-foreground ml-2 font-mono">
            liveport — bash
          </span>
        </div>

        {/* Terminal content */}
        <div className="p-4 font-mono text-sm h-[320px] overflow-hidden">
          {TERMINAL_LINES.slice(0, visibleLines).map((line, index) => (
            <div
              key={index}
              className={`${getLineClass(line.type)} whitespace-pre leading-relaxed`}
            >
              {line.text || "\u00A0"}
            </div>
          ))}
          {/* Cursor */}
          <span className="inline-block w-2 h-4 bg-primary animate-pulse" />
        </div>
      </div>
    </div>
  );
}
