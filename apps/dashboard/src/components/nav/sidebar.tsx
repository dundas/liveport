"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Home, Key, Radio, Settings, LogOut, CreditCard } from "lucide-react";
import { useAuth } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/keys", label: "Bridge Keys", icon: Key },
  { href: "/tunnels", label: "Tunnels", icon: Radio },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border bg-background">
      <div className="flex h-16 items-center border-b border-border px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Radio className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold font-mono uppercase tracking-tighter">LIVE<span className="text-primary">PORT</span>_</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm font-mono uppercase tracking-wider transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center border border-primary bg-black text-primary text-sm font-mono uppercase">
            {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || "?"}
          </div>
          <div className="flex-1 truncate">
            <p className="text-sm font-mono uppercase">{user?.name || "User"}</p>
            <p className="text-xs text-muted-foreground font-mono truncate">{user?.email || ""}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-start text-muted-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );
}