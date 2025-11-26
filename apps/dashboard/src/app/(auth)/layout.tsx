import { Radio } from "lucide-react";
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-8 flex items-center gap-2">
        <Radio className="h-8 w-8 text-primary" />
        <span className="text-2xl font-bold">LivePort</span>
      </div>
      <div className="w-full max-w-md">{children}</div>
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Secure localhost tunnels for AI agents
      </p>
    </div>
  );
}
