import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getServerSession } from "@/lib/auth-server";

export async function SiteHeader() {
  const session = await getServerSession();

  return (
    <header className="flex h-20 items-center justify-between border-b border-border px-6 lg:px-12 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <Link href="/" className="text-2xl font-bold tracking-tighter text-foreground hover:opacity-80 transition-opacity">
          LIVE<span className="text-primary">PORT</span>_
        </Link>
      </div>
      <nav className="hidden md:flex items-center gap-8 text-sm font-bold uppercase tracking-wider">
        <Link href="/docs" className="text-muted-foreground hover:text-primary transition-colors">Docs</Link>
        <Link href="/blog" className="text-muted-foreground hover:text-primary transition-colors">Blog</Link>
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
  );
}
