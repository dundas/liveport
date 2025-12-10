"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Copy, Check, Loader2 } from "lucide-react";

interface CreateKeyDialogProps {
  onKeyCreated: () => void;
}

export function CreateKeyDialog({ onKeyCreated }: CreateKeyDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "success">("form");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdKey, setCreatedKey] = useState("");
  const [copied, setCopied] = useState(false);

  // Form state
  const [expiresIn, setExpiresIn] = useState<"1h" | "6h" | "24h" | "7d">("6h");
  const [maxUses, setMaxUses] = useState<string>("");
  const [allowedPort, setAllowedPort] = useState<string>("");

  const handleCreate = async () => {
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expiresIn,
          maxUses: maxUses ? parseInt(maxUses, 10) : undefined,
          allowedPort: allowedPort ? parseInt(allowedPort, 10) : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create key");
      }

      const data = await response.json();
      setCreatedKey(data.key);
      setStep("success");
      // Note: onKeyCreated will be called when user clicks "Done" to avoid
      // re-render closing the modal before user can copy the key
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = (shouldRefresh = false) => {
    // Capture success state before resetting
    const wasSuccess = step === "success";
    
    // Reset state immediately to avoid race conditions
    setStep("form");
    setCreatedKey("");
    setError("");
    setExpiresIn("6h");
    setMaxUses("");
    setAllowedPort("");
    
    setOpen(false);
    
    // Refresh keys list if a key was created
    if (shouldRefresh || wasSuccess) {
      onKeyCreated();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) handleClose();
      else setOpen(true);
    }}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Key
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {step === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle>Create Bridge Key</DialogTitle>
              <DialogDescription>
                Generate a new bridge key for CLI or agent authentication.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="expiresIn">Expiration</Label>
                <select
                  id="expiresIn"
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(e.target.value as typeof expiresIn)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="1h">1 hour</option>
                  <option value="6h">6 hours</option>
                  <option value="24h">24 hours</option>
                  <option value="7d">7 days</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxUses">Max Uses (optional)</Label>
                <Input
                  id="maxUses"
                  type="number"
                  placeholder="Unlimited"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  min={1}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty for unlimited uses
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="allowedPort">Allowed Port (optional)</Label>
                <Input
                  id="allowedPort"
                  type="number"
                  placeholder="Any port"
                  value={allowedPort}
                  onChange={(e) => setAllowedPort(e.target.value)}
                  min={1}
                  max={65535}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to allow any port
                </p>
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose()}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Key
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Key Created Successfully</DialogTitle>
              <DialogDescription>
                Copy your bridge key now. You won&apos;t be able to see it again!
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="flex items-center space-x-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                  {createdKey}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                Use this key with the CLI:
              </p>
              <code className="mt-2 block rounded bg-muted px-3 py-2 text-sm font-mono">
                liveport connect 3000 --key {createdKey.substring(0, 12)}...
              </code>
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose()}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
