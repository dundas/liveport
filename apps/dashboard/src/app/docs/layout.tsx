import { SiteHeader } from "@/components/shared/site-header";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col font-mono bg-background text-foreground">
      <SiteHeader />

      {/* Docs Hero Section */}
      <div className="border-b border-border py-12 px-6 lg:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2 border border-primary/50 px-3 py-1.5 text-xs text-primary uppercase tracking-widest">
              <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span>
              API Reference
            </div>
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold uppercase tracking-tight mb-4">
            API <span className="text-primary">Documentation</span>
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-3xl">
            Interactive OpenAPI documentation for the LivePort tunnel server.
            Explore endpoints, test requests, and integrate with your applications.
          </p>
        </div>
      </div>

      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-border text-center md:text-left">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-sm text-muted-foreground font-bold uppercase tracking-widest">
            LivePort © 2025 // All Systems Nominal
          </div>
          <div className="flex gap-6 text-sm font-bold uppercase tracking-wider">
            <a href="/terms" className="text-muted-foreground hover:text-primary transition-colors">Terms</a>
            <a href="/privacy" className="text-muted-foreground hover:text-primary transition-colors">Privacy</a>
            <a href="/status" className="text-muted-foreground hover:text-primary transition-colors">Status</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
