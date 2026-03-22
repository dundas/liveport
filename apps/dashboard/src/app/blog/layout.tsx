import { SiteHeader } from "@/components/shared/site-header";

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col font-mono bg-background text-foreground">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <footer className="py-12 px-6 border-t border-border text-center md:text-left">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-sm text-muted-foreground font-bold uppercase tracking-widest">
            LivePort © 2025 // All Systems Nominal
          </div>
          <div className="flex gap-6 text-sm font-bold uppercase tracking-wider">
            <a href="/terms" className="text-muted-foreground hover:text-primary transition-colors">Terms</a>
            <a href="/privacy" className="text-muted-foreground hover:text-primary transition-colors">Privacy</a>
            <a href="/status" className="text-muted-foreground hover:text-primary transition-colors">Status</a>
            <a href="/blog/rss.xml" className="text-muted-foreground hover:text-primary transition-colors">RSS</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
