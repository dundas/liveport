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
  Zap,
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
}

interface Invoice {
  id: string;
  amount: number;
  status: string;
  created: string;
  pdfUrl: string | null;
}

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

export default function BillingPage() {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Mock data - replace with actual API calls
  const [balance, setBalance] = useState(50.00); // User's credit balance
  
  // Free tier: 5 hours tunnel time + 1 GB bandwidth per month
  // 5 hours * $0.018/hour = $0.09
  // 1 GB * $0.05/GB = $0.05
  // Total free tier value = $0.14
  const freeUsageRemaining = 0.14; // Monthly free tier value

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

  const handleTopUp = async (amount: number) => {
    setActionLoading(`topup-${amount}`);
    try {
      const res = await fetch("/api/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });

      if (res.ok) {
        const data = await res.json();
        setBalance(data.newBalance);
      } else {
        setError("Failed to process top-up");
      }
    } catch (err) {
      setError("Error processing top-up");
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleManagePaymentMethods = async () => {
    setActionLoading("portal");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError("Failed to open billing portal");
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing & Credits</h1>
        <p className="text-muted-foreground mt-2">Manage your account balance and usage</p>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6 flex gap-3">
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-destructive">Error</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credits Overview */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Account Balance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Account Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">{formatCurrency(balance)}</span>
              <Badge variant="outline" className="ml-auto">Paid Credits</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Available to spend on usage</p>
          </CardContent>
        </Card>

        {/* Free Tier */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Free Tier This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">{formatCurrency(freeUsageRemaining)}</span>
              <Badge variant="outline" className="ml-auto bg-green-500/10 text-green-700">Free</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-3">5 hours + 1 GB (resets monthly)</p>
          </CardContent>
        </Card>

        {/* Total Available */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Available</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">{formatCurrency(balance + freeUsageRemaining)}</span>
              <Badge variant="outline" className="ml-auto">Combined</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Free tier + paid credits</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Up Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Add Credits
          </CardTitle>
          <CardDescription>Purchase credits to use beyond your monthly free tier</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-3">
            {[10, 25, 50, 100].map((amount) => (
              <Button
                key={amount}
                variant="outline"
                onClick={() => handleTopUp(amount)}
                disabled={actionLoading !== null}
                className="h-auto flex-col py-4"
              >
                {actionLoading === `topup-${amount}` && (
                  <Loader2 className="h-4 w-4 animate-spin mb-2" />
                )}
                <span className="font-bold">${amount}</span>
                <span className="text-xs text-muted-foreground">Add credits</span>
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            We accept card and stablecoins (USDC, USDP, USDG). Credits never expire.
          </p>
        </CardContent>
      </Card>

      {/* Current Usage */}
      {usage && (
        <Card>
          <CardHeader>
            <CardTitle>Current Period Usage</CardTitle>
            <CardDescription>
              {formatDate(usage.period.start)} to {formatDate(usage.period.end)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Tunnel Time */}
              <div className="flex items-center justify-between pb-4 border-b">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Tunnel Time</p>
                    <p className="text-sm text-muted-foreground">{usage.usage.tunnelHours.toFixed(2)} hours</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(usage.costs.tunnelCost)}</p>
                  <p className="text-xs text-muted-foreground">$0.018/hour</p>
                </div>
              </div>

              {/* Bandwidth */}
              <div className="flex items-center justify-between pb-4 border-b">
                <div className="flex items-center gap-3">
                  <HardDrive className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Bandwidth</p>
                    <p className="text-sm text-muted-foreground">{usage.usage.bandwidthGB.toFixed(2)} GB</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(usage.costs.bandwidthCost)}</p>
                  <p className="text-xs text-muted-foreground">$0.05/GB</p>
                </div>
              </div>

              {/* Total */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-primary" />
                  <p className="font-semibold">Total This Period</p>
                </div>
                <p className="text-2xl font-bold">{formatCurrency(usage.costs.totalCost)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Methods */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Payment Methods
          </CardTitle>
          <CardDescription>Manage your payment methods and billing settings</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleManagePaymentMethods}
            disabled={actionLoading === "portal"}
            variant="outline"
            className="w-full sm:w-auto"
          >
            {actionLoading === "portal" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Open Billing Portal
            <ExternalLink className="h-4 w-4 ml-2" />
          </Button>
          <p className="text-xs text-muted-foreground mt-4">
            Update payment methods, view invoices, and manage billing settings in the Stripe portal.
          </p>
        </CardContent>
      </Card>

      {/* Recent Invoices */}
      {invoices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                  <div>
                    <p className="font-medium">{invoice.id}</p>
                    <p className="text-sm text-muted-foreground">{formatDate(invoice.created)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-semibold">{formatCurrency(invoice.amount)}</p>
                      <Badge variant="outline" className="text-xs mt-1">
                        {invoice.status}
                      </Badge>
                    </div>
                    {invoice.pdfUrl && (
                      <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Box */}
      <Card className="bg-accent/50 border-accent">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm">
              <p className="font-semibold">How billing works</p>
              <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                <li>Each month you get <strong>5 hours</strong> tunnel time + <strong>1 GB</strong> bandwidth free</li>
                <li>Free tier value: ${freeUsageRemaining.toFixed(2)} (5h × $0.018 + 1GB × $0.05)</li>
                <li>Free usage deducts first, then your paid credits</li>
                <li>Unused free tier does not roll over to next month</li>
                <li>Add credits anytime to ensure uninterrupted service</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
