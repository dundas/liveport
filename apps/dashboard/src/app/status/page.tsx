import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function StatusPage() {
  return (
    <div className="min-h-screen flex flex-col font-mono bg-background text-foreground">
      {/* Header */}
      <header className="flex h-20 items-center justify-between border-b border-border px-6 lg:px-12 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl font-bold tracking-tighter text-foreground">
            LIVE<span className="text-primary">PORT</span>_
          </span>
        </Link>
        <Link href="/">
          <Button variant="outline">Back to Home</Button>
        </Link>
      </header>

      <main className="flex-1 max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-bold tracking-tighter">SYSTEM STATUS</h1>
          <Badge variant="default" className="text-lg px-4 py-2">
            ALL SYSTEMS OPERATIONAL
          </Badge>
        </div>
        
        <div className="space-y-6">
          <section className="border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold uppercase">Dashboard</h2>
              <Badge variant="default">ONLINE</Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              Web interface for managing tunnels and bridge keys
            </p>
          </section>

          <section className="border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold uppercase">Tunnel Server</h2>
              <Badge variant="default">ONLINE</Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              WebSocket tunnel server for secure localhost connections
            </p>
          </section>

          <section className="border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold uppercase">Database</h2>
              <Badge variant="default">ONLINE</Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              User data and bridge key storage
            </p>
          </section>

          <section className="border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold uppercase">Redis Cache</h2>
              <Badge variant="default">ONLINE</Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              Rate limiting and session management
            </p>
          </section>

          <div className="mt-12 pt-8 border-t border-border">
            <h3 className="text-lg font-bold mb-4 uppercase">Service Monitoring</h3>
            <p className="text-muted-foreground mb-4">
              For real-time status updates and incident reports, visit our monitoring dashboard:
            </p>
            <a 
              href="https://status.liveport.online" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              status.liveport.online →
            </a>
          </div>

          <div className="mt-8 pt-8 border-t border-border">
            <h3 className="text-lg font-bold mb-4 uppercase">Report an Issue</h3>
            <p className="text-muted-foreground mb-4">
              If you&apos;re experiencing problems with the service, please report them on our GitHub repository:
            </p>
            <a 
              href="https://github.com/dundas/liveport/issues" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              github.com/dundas/liveport/issues →
            </a>
          </div>

          <div className="mt-12 pt-8 border-t border-border text-sm text-muted-foreground">
            <p>Last Updated: November 28, 2025</p>
            <p className="mt-2">Status page is updated automatically every 5 minutes</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-border text-center">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-sm text-muted-foreground font-bold uppercase tracking-widest">
            LivePort © 2025 // All Systems Nominal
          </div>
          <div className="flex gap-8 text-sm font-bold uppercase tracking-wider">
            <Link href="/terms" className="text-muted-foreground hover:text-primary">Terms</Link>
            <Link href="/privacy" className="text-muted-foreground hover:text-primary">Privacy</Link>
            <Link href="/status" className="text-primary">Status</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
