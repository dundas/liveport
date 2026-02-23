import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getServerSession } from "@/lib/auth-server";
import { InstallCommand } from "@/components/landing/install-command";
import { TerminalMockup } from "@/components/landing/terminal-mockup";
import { ExternalLink } from "lucide-react";

export default async function LandingPage() {
  const session = await getServerSession();

  return (
    <div className="min-h-screen flex flex-col font-mono bg-background text-foreground selection:bg-primary selection:text-black">
      {/* Header */}
      <header className="flex h-20 items-center justify-between border-b border-border px-6 lg:px-12 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold tracking-tighter text-foreground">
            LIVE<span className="text-primary">PORT</span>_
          </span>
        </div>
        <nav className="hidden md:flex items-center gap-8 text-sm font-bold uppercase tracking-wider">
          <Link href="/docs" className="text-muted-foreground hover:text-primary transition-colors">Docs</Link>
          <Link href="/pricing" className="text-muted-foreground hover:text-primary transition-colors">Pricing</Link>
          <Link href="/#features" className="text-muted-foreground hover:text-primary transition-colors">Features</Link>
          <Link href="https://github.com/dundas/liveport" target="_blank" className="text-muted-foreground hover:text-primary transition-colors">GitHub</Link>
        </nav>
        <div className="flex items-center gap-4">
          {session ? (
            <Link href="/dashboard">
              <Button variant="default">Dashboard</Button>
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden sm:block">
                <Button variant="ghost">Login</Button>
              </Link>
              <Link href="/signup">
                <Button variant="default">Get Started</Button>
              </Link>
            </>
          )}
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-16 lg:py-24 px-6 lg:px-12 border-b border-border overflow-hidden">
          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Left Column - Text */}
              <div>
                {/* Status Badge */}
                <div className="flex items-center gap-3 mb-8">
                  <div className="flex items-center gap-2 border border-primary/50 px-3 py-1.5 text-xs text-primary uppercase tracking-widest">
                    <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span>
                    v1.0 Available
                  </div>
                  <Link 
                    href="https://github.com/dundas/liveport" 
                    target="_blank"
                    className="flex items-center gap-2 border border-border px-3 py-1.5 text-xs text-muted-foreground uppercase tracking-widest hover:text-foreground hover:border-foreground transition-colors"
                  >
                    <span>Open Source</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
                
                <h1 className="text-4xl lg:text-6xl font-bold leading-[1.1] mb-6 tracking-tight">
                  Secure Tunnels<br />
                  <span className="text-primary">For AI Agents.</span>
                </h1>
                <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                  Expose your localhost to the internet with one command. 
                  Built for developers and AI agents that need to test 
                  webhooks, share demos, and access local services remotely.
                </p>

                {/* Install Command */}
                <div className="mb-8">
                  <InstallCommand />
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <Link href={session ? "/dashboard" : "/signup"}>
                    <Button size="lg" className="w-full sm:w-auto">
                      Get Started Free
                    </Button>
                  </Link>
                  <Link href="/docs">
                    <Button variant="outline" size="lg" className="w-full sm:w-auto">
                      Read Documentation
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Right Column - Terminal Mockup */}
              <div className="hidden lg:flex justify-center">
                <TerminalMockup />
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="grid md:grid-cols-3 border-b border-border divide-y md:divide-y-0 md:divide-x divide-border">
          <div className="p-12 group hover:bg-accent transition-colors">
            <div className="text-4xl font-bold text-border mb-6 group-hover:text-primary transition-colors">01_</div>
            <h3 className="text-xl font-bold uppercase mb-4 text-foreground">Instant Tunnels</h3>
            <p className="text-muted-foreground leading-relaxed">
              Bypass firewalls and NATs with a single command. No router configuration required. 
              Generated SSL certificates included automatically.
            </p>
          </div>
          <div className="p-12 group hover:bg-accent transition-colors">
            <div className="text-4xl font-bold text-border mb-6 group-hover:text-primary transition-colors">02_</div>
            <h3 className="text-xl font-bold uppercase mb-4 text-foreground">Bridge Keys</h3>
            <p className="text-muted-foreground leading-relaxed">
              Secure your tunnels with cryptographic keys. Control access, expiration, and 
              rate limits per key. Designed for zero-trust environments.
            </p>
          </div>
          <div className="p-12 group hover:bg-accent transition-colors">
            <div className="text-4xl font-bold text-border mb-6 group-hover:text-primary transition-colors">03_</div>
            <h3 className="text-xl font-bold uppercase mb-4 text-foreground">Agent SDK</h3>
            <p className="text-muted-foreground leading-relaxed">
              First-class support for AI agents. Programmatically control tunnels and 
              wait for connections in your test suites via TypeScript SDK.
            </p>
          </div>
        </section>

        {/* SDK Preview */}
        <section className="py-20 px-6 lg:px-12 flex flex-col items-center border-b border-border bg-accent/5">
          <div className="w-full max-w-4xl">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold uppercase tracking-wider">Programmatic Control</h2>
              <div className="text-xs text-muted-foreground border border-border px-2 py-1">SDK_USAGE.TS</div>
            </div>
            
            <div className="bg-black border border-border p-8 font-mono text-sm overflow-x-auto shadow-[12px_12px_0_var(--color-primary)] relative group">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-transparent opacity-50"></div>
              <pre className="text-muted-foreground">
                <span className="text-primary">import</span> {"{ LivePortAgent }"} <span className="text-primary">from</span> <span className="text-foreground">&quot;@liveport/agent-sdk&quot;</span>;
                {"\n\n"}
                <span className="text-primary">const</span> agent = <span className="text-primary">new</span> <span className="text-yellow-500">LivePortAgent</span>({"{"}
                {"\n  "}key: <span className="text-foreground">&quot;lpk_production_key&quot;</span>
                {"\n"}{"}"});
                {"\n\n"}
                {/* Wait for tunnel to be established */}
                <span className="text-gray-500">{"// Wait for tunnel to be established"}</span>
                {"\n"}
                <span className="text-primary">const</span> tunnel = <span className="text-primary">await</span> agent.<span className="text-yellow-500">waitForTunnel</span>();
                {"\n\n"}
                console.<span className="text-yellow-500">log</span>(<span className="text-foreground">{"`Target acquired: ${tunnel.url}`"}</span>);
              </pre>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-border text-center md:text-left">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-sm text-muted-foreground font-bold uppercase tracking-widest">
            LivePort © 2025 // All Systems Nominal
          </div>
          <div className="flex gap-6 text-sm font-bold uppercase tracking-wider">
            <Link href="/terms" className="text-muted-foreground hover:text-primary">Terms</Link>
            <Link href="/privacy" className="text-muted-foreground hover:text-primary">Privacy</Link>
            <Link href="/status" className="text-muted-foreground hover:text-primary">Status</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}