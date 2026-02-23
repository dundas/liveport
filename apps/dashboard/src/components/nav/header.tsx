"use client";

export function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-6">
      <div>
        <h1 className="text-lg font-bold font-mono uppercase tracking-wider">Dashboard</h1>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-primary border border-primary px-2 py-1 uppercase tracking-widest">
          System: Online
        </span>
      </div>
    </header>
  );
}