import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getServerSession } from "@/lib/auth-server";
import { Check } from "lucide-react";

export default async function PricingPage() {
  const session = await getServerSession();

  return (
    <div className="min-h-screen flex flex-col font-mono bg-background text-foreground selection:bg-primary selection:text-black">
      {/* Header */}
      <header className="flex h-20 items-center justify-between border-b border-border px-6 lg:px-12 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold tracking-tighter text-foreground">
            LIVE<span className="text-primary">PORT</span>_
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm font-bold uppercase tracking-wider">
          <Link href="/docs" className="text-muted-foreground hover:text-primary transition-colors">Docs</Link>
          <Link href="/pricing" className="text-primary transition-colors">Pricing</Link>
          <Link href="https://github.com/dundas/liveport" target="_blank" className="text-muted-foreground hover:text-primary transition-colors">GitHub</Link>
        </nav>
        <div className="flex items-center gap-4">
          {session ? (
            <Link href="/dashboard">
              <Button variant="default">Dashboard</Button>
            </Link>
          ) : (
            <Link href="/login">
              <Button variant="outline">Login</Button>
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative py-20 lg:py-24 px-6 lg:px-12 border-b border-border overflow-hidden">
          <div className="absolute top-6 left-6 border border-primary px-2 py-1 text-xs text-primary uppercase tracking-widest">
            Pricing: Active
          </div>
          
          <div className="max-w-5xl mx-auto text-center">
            <h1 className="text-5xl lg:text-6xl font-bold leading-tight mb-6 tracking-tighter">
              PAY FOR WHAT YOU <span className="bg-primary text-black px-2">USE</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-4 leading-relaxed">
              No monthly minimums. No hidden fees. Just simple, transparent pricing 
              that scales with your usage.
            </p>
            <div className="flex flex-wrap justify-center gap-3 text-sm">
              <span className="border border-border px-3 py-1 text-muted-foreground">CARD</span>
              <span className="border border-blue-500/50 px-3 py-1 text-blue-400">USDC</span>
              <span className="border border-green-500/50 px-3 py-1 text-green-400">USDP</span>
              <span className="border border-purple-500/50 px-3 py-1 text-purple-400">USDG</span>
            </div>
          </div>
        </section>

        {/* Pricing Grid */}
        <section className="grid md:grid-cols-3 border-b border-border divide-y md:divide-y-0 md:divide-x divide-border">
          {/* Tunnel Time */}
          <div className="p-12 group hover:bg-accent transition-colors">
            <div className="text-4xl font-bold text-border mb-6 group-hover:text-primary transition-colors">01_</div>
            <h3 className="text-xl font-bold uppercase mb-2 text-foreground">Tunnel Time</h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-primary">$0.018</span>
              <span className="text-muted-foreground">/hour</span>
            </div>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-1 shrink-0" />
                <span>Billed per second of active tunnel</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-1 shrink-0" />
                <span>~$0.43/day for 24/7 usage</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-1 shrink-0" />
                <span>~$13/month continuous</span>
              </li>
            </ul>
          </div>

          {/* Bandwidth */}
          <div className="p-12 group hover:bg-accent transition-colors">
            <div className="text-4xl font-bold text-border mb-6 group-hover:text-primary transition-colors">02_</div>
            <h3 className="text-xl font-bold uppercase mb-2 text-foreground">Bandwidth</h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-primary">$0.05</span>
              <span className="text-muted-foreground">/GB</span>
            </div>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-1 shrink-0" />
                <span>Request + response data</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-1 shrink-0" />
                <span>No egress fees</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-1 shrink-0" />
                <span>Unlimited requests</span>
              </li>
            </ul>
          </div>

          {/* Static Subdomain */}
          <div className="p-12 group hover:bg-accent transition-colors">
            <div className="text-4xl font-bold text-border mb-6 group-hover:text-primary transition-colors">03_</div>
            <h3 className="text-xl font-bold uppercase mb-2 text-foreground">Static URL</h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-primary">$2.50</span>
              <span className="text-muted-foreground">/month</span>
            </div>
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-1 shrink-0" />
                <span>Reserved subdomain</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-1 shrink-0" />
                <span>Pro-rated daily billing</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-1 shrink-0" />
                <span>Optional add-on</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Cost Examples */}
        <section className="py-20 px-6 lg:px-12 border-b border-border bg-accent/5">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-12">
              <h2 className="text-2xl font-bold uppercase tracking-wider">Cost Examples</h2>
              <div className="text-xs text-muted-foreground border border-border px-2 py-1">ESTIMATES.TXT</div>
            </div>

            <div className="bg-black border border-border p-8 font-mono text-sm shadow-[12px_12px_0_var(--color-primary)] relative">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-transparent opacity-50"></div>
              <pre className="text-muted-foreground overflow-x-auto">
{`┌─────────────────────────────────────────────────────────────┐
│  USAGE SCENARIO                        │  MONTHLY COST     │
├─────────────────────────────────────────────────────────────┤
│  Light (2hr/day, 1GB)                  │  $1.13            │
│  Moderate (8hr/day, 10GB)              │  $4.82            │
│  Heavy (24/7, 50GB)                    │  $15.50           │
│  Enterprise (24/7, 500GB + static)     │  $40.50           │
└─────────────────────────────────────────────────────────────┘

> Compared to ngrok Pro at $20/month for limited tunnels
> LivePort: Pay only for actual usage, unlimited tunnels`}
              </pre>
            </div>
          </div>
        </section>

        {/* Features Included */}
        <section className="py-20 px-6 lg:px-12 border-b border-border">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold uppercase tracking-wider mb-12 text-center">
              Included With Every Tunnel
            </h2>
            
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { title: "SSL/TLS", desc: "Auto-generated certificates" },
                { title: "Bridge Keys", desc: "Secure access control" },
                { title: "Dashboard", desc: "Real-time monitoring" },
                { title: "Agent SDK", desc: "Programmatic control" },
                { title: "Webhooks", desc: "Event notifications" },
                { title: "Logs", desc: "Request inspection" },
                { title: "Multi-Region", desc: "Global edge network" },
                { title: "Support", desc: "Community + docs" },
              ].map((feature, i) => (
                <div key={i} className="border border-border p-6 hover:border-primary transition-colors group">
                  <h3 className="font-bold uppercase mb-2 group-hover:text-primary transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-6 lg:px-12 border-b border-border">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl lg:text-4xl font-bold uppercase tracking-tighter mb-6">
              Start Building <span className="text-primary">Today</span>
            </h2>
            <p className="text-muted-foreground mb-8 text-lg">
              No credit card required to get started. Pay only when you exceed the free tier.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href={session ? "/dashboard" : "/signup"}>
                <Button size="lg" className="w-full sm:w-auto">
                  {session ? "Go to Dashboard" : "Create Free Account"}
                </Button>
              </Link>
              <Link href="/docs">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  Read Documentation
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 px-6 lg:px-12">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold uppercase tracking-wider mb-12 text-center">
              Frequently Asked
            </h2>
            
            <div className="space-y-6">
              {[
                {
                  q: "Is there a free tier?",
                  a: "Yes! New accounts get 2 concurrent tunnels and 1GB/month free during our MVP phase."
                },
                {
                  q: "How does billing work?",
                  a: "Usage is tracked in real-time and billed monthly. You'll receive an invoice at the end of each billing period."
                },
                {
                  q: "Can I pay with crypto?",
                  a: "Yes! We accept USDC, USDP, and USDG stablecoins on Ethereum, Solana, Polygon, and Base networks."
                },
                {
                  q: "What happens if I exceed my usage?",
                  a: "There are no hard limits. You're billed for actual usage at the rates shown above."
                },
                {
                  q: "Can I cancel anytime?",
                  a: "Absolutely. Cancel your subscription anytime. You'll retain access until the end of your billing period."
                },
              ].map((faq, i) => (
                <div key={i} className="border-b border-border pb-6">
                  <h3 className="font-bold uppercase mb-2 text-foreground">{faq.q}</h3>
                  <p className="text-muted-foreground">{faq.a}</p>
                </div>
              ))}
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
