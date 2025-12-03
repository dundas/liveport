"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  CreditCard, 
  Clock, 
  HardDrive, 
  DollarSign,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  XCircle
} from "lucide-react";

interface UsageData {
  usage: {
    tunnelSeconds: number;
    tunnelHours: number;
    bandwidthBytes: number;
    bandwidthGB: number;
    tunnelCount: number;
  };
  costs: {
    tunnelCost: number;
    bandwidthCost: number;
    totalCost: number;
  };
  period: {
    start: string;
    end: string;
  };
  subscription: {
    hasSubscription: boolean;
    status: string | null;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    cancelAt: string | null;
  } | null;
}

interface Invoice {
  id: string;
  amount: number;
  status: string;
  created: string;
  pdfUrl: string | null;
}

// Pricing constants for display
const PRICING = {
  tunnelPerSecond: 0.000005,
  tunnelPerHour: 0.018,
  tunnelPerDay: 0.43,
  tunnelPerMonth: 13,
  bandwidthPerGB: 0.05,
  staticSubdomainPerMonth: 2.50,
};

function formatCurrency(amount: number): string {
  if (amount < 0.01) {
    return `$${amount.toFixed(6)}`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function SubscriptionStatusBadge({ status, cancelAtPeriodEnd }: { status: string | null; cancelAtPeriodEnd: boolean }) {
  if (!status) {
    return <Badge variant="secondary">No Subscription</Badge>;
  }
  
  if (cancelAtPeriodEnd) {
    return <Badge variant="destructive">Canceling</Badge>;
  }
  
  switch (status) {
    case "active":
      return <Badge className="bg-green-600">Active</Badge>;
    case "trialing":
      return <Badge className="bg-blue-600">Trial</Badge>;
    case "past_due":
      return <Badge variant="destructive">Past Due</Badge>;
    case "canceled":
      return <Badge variant="secondary">Canceled</Badge>;
    case "incomplete":
      return <Badge variant="outline">Incomplete</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function BillingPage() {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [usageRes, invoicesRes] = await Promise.all([
        fetch("/api/billing/usage"),
        fetch("/api/billing/invoices"),
      ]);

      if (usageRes.ok) {
        const usageData = await usageRes.json();
        setUsage(usageData);
      }

      if (invoicesRes.ok) {
        const invoicesData = await invoicesRes.json();
        setInvoices(invoicesData.invoices || []);
      }
    } catch (err) {
      setError("Failed to load billing data");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubscribe = async () => {
    setActionLoading("subscribe");
    try {
      const res = await fetch("/api/billing/subscribe", { method: "POST" });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to create subscription");
      }

      // If we have a client secret, redirect to Stripe checkout
      if (data.clientSecret) {
        // For now, redirect to Stripe portal for payment
        await handleManageBilling();
      } else {
        // Subscription created without payment needed (e.g., metered only)
        await fetchData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to subscribe");
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (immediately: boolean = false) => {
    const confirmMessage = immediately
      ? "Are you sure you want to cancel your subscription immediately? You will lose access right away."
      : "Are you sure you want to cancel your subscription? You will retain access until the end of your billing period.";
    
    if (!confirm(confirmMessage)) return;

    setActionLoading("cancel");
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ immediately }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel subscription");
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async () => {
    setActionLoading("resume");
    try {
      const res = await fetch("/api/billing/cancel", { method: "DELETE" });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to resume subscription");
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resume");
    } finally {
      setActionLoading(null);
    }
  };

  const handleManageBilling = async () => {
    setActionLoading("portal");
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl: window.location.href }),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to open billing portal");
      }

      const data = await res.json();
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open portal");
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-mono uppercase">Billing</h1>
        <p className="text-muted-foreground">
          Manage your subscription and view usage
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="ml-auto"
            onClick={() => setError(null)}
          >
            Dismiss
          </Button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
        {/* Pricing Card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-mono uppercase flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Pricing
            </CardTitle>
            <CardDescription>
              Pay only for what you use. No monthly minimums.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Payment methods accepted */}
            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              <div className="text-xs text-muted-foreground mb-2 uppercase font-mono">Accepted Payment Methods</div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="font-mono">
                  <CreditCard className="h-3 w-3 mr-1" />
                  Card
                </Badge>
                <Badge variant="outline" className="font-mono bg-blue-500/10 border-blue-500/30 text-blue-600">
                  <svg className="h-3 w-3 mr-1" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                  USDC
                </Badge>
                <Badge variant="outline" className="font-mono bg-green-500/10 border-green-500/30 text-green-600">
                  USDP
                </Badge>
                <Badge variant="outline" className="font-mono bg-purple-500/10 border-purple-500/30 text-purple-600">
                  USDG
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Stablecoins accepted via Ethereum, Solana, Polygon, and Base networks
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-primary" />
                  <span className="font-mono text-sm uppercase">Tunnel Time</span>
                </div>
                <div className="text-2xl font-bold font-mono">
                  {formatCurrency(PRICING.tunnelPerHour)}
                  <span className="text-sm text-muted-foreground">/hour</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  ~{formatCurrency(PRICING.tunnelPerMonth)}/month for 24/7
                </p>
              </div>
              
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive className="h-4 w-4 text-primary" />
                  <span className="font-mono text-sm uppercase">Bandwidth</span>
                </div>
                <div className="text-2xl font-bold font-mono">
                  {formatCurrency(PRICING.bandwidthPerGB)}
                  <span className="text-sm text-muted-foreground">/GB</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Request + response data
                </p>
              </div>
              
              <div className="p-4 border rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard className="h-4 w-4 text-primary" />
                  <span className="font-mono text-sm uppercase">Static URL</span>
                </div>
                <div className="text-2xl font-bold font-mono">
                  {formatCurrency(PRICING.staticSubdomainPerMonth)}
                  <span className="text-sm text-muted-foreground">/month</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Optional, pro-rated daily
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="font-mono uppercase flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Subscription
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <SubscriptionStatusBadge 
                status={usage?.subscription?.status || null}
                cancelAtPeriodEnd={usage?.subscription?.cancelAtPeriodEnd || false}
              />
            </div>
            
            {usage?.subscription?.currentPeriodEnd && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {usage.subscription.cancelAtPeriodEnd ? "Access until" : "Renews"}
                </span>
                <span>{formatDate(usage.subscription.currentPeriodEnd)}</span>
              </div>
            )}

            <div className="pt-4 space-y-2">
              {!usage?.subscription?.hasSubscription ? (
                <Button 
                  className="w-full" 
                  onClick={handleSubscribe}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === "subscribe" ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Subscribe
                </Button>
              ) : usage.subscription.cancelAtPeriodEnd ? (
                <Button 
                  className="w-full" 
                  onClick={handleResume}
                  disabled={actionLoading !== null}
                >
                  {actionLoading === "resume" ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Resume Subscription
                </Button>
              ) : (
                <>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={handleManageBilling}
                    disabled={actionLoading !== null}
                  >
                    {actionLoading === "portal" ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <ExternalLink className="h-4 w-4 mr-2" />
                    )}
                    Manage Billing
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => handleCancel(false)}
                    disabled={actionLoading !== null}
                  >
                    {actionLoading === "cancel" ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-2" />
                    )}
                    Cancel Subscription
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current Usage */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="font-mono uppercase">Current Period Usage</CardTitle>
          <CardDescription>
            {usage?.period && (
              <>
                {formatDate(usage.period.start)} - {formatDate(usage.period.end)}
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Tunnel Time</div>
              <div className="text-2xl font-bold font-mono">
                {usage?.usage.tunnelHours.toFixed(2) || "0.00"}
                <span className="text-sm text-muted-foreground ml-1">hours</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {formatCurrency(usage?.costs.tunnelCost || 0)}
              </div>
            </div>
            
            <div>
              <div className="text-sm text-muted-foreground mb-1">Bandwidth</div>
              <div className="text-2xl font-bold font-mono">
                {usage?.usage.bandwidthGB.toFixed(2) || "0.00"}
                <span className="text-sm text-muted-foreground ml-1">GB</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {formatCurrency(usage?.costs.bandwidthCost || 0)}
              </div>
            </div>
            
            <div>
              <div className="text-sm text-muted-foreground mb-1">Tunnels Created</div>
              <div className="text-2xl font-bold font-mono">
                {usage?.usage.tunnelCount || 0}
              </div>
            </div>
            
            <div>
              <div className="text-sm text-muted-foreground mb-1">Estimated Total</div>
              <div className="text-2xl font-bold font-mono text-primary">
                {formatCurrency(usage?.costs.totalCost || 0)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoice History */}
      {invoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-mono uppercase">Invoice History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {invoices.map((invoice) => (
                <div 
                  key={invoice.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <div className="font-mono text-sm">{formatDate(invoice.created)}</div>
                    <div className="text-sm text-muted-foreground">
                      {invoice.status === "paid" ? (
                        <span className="text-green-600">Paid</span>
                      ) : (
                        <span>{invoice.status}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-mono font-bold">
                      {formatCurrency(invoice.amount)}
                    </span>
                    {invoice.pdfUrl && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
