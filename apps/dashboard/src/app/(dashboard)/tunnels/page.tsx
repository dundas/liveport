"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Radio, ExternalLink, XCircle, RefreshCw, Loader2 } from "lucide-react";

interface Tunnel {
  id: string;
  subdomain: string;
  localPort: number;
  keyName: string;
  connectedAt: string;
  requestCount: number;
  state: string;
}

const REFRESH_INTERVAL = 5000; // 5 seconds

export default function TunnelsPage() {
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchTunnels = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    }

    try {
      const response = await fetch("/api/tunnels");
      if (!response.ok) {
        throw new Error("Failed to fetch tunnels");
      }
      const data = await response.json();
      setTunnels(data.tunnels || []);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      const error = err as Error;
      setError(error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    fetchTunnels();

    const interval = setInterval(() => {
      fetchTunnels();
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchTunnels]);

  const handleRefresh = () => {
    fetchTunnels(true);
  };

  const handleDisconnect = async (tunnelId: string) => {
    try {
      const response = await fetch(`/api/tunnels/${tunnelId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        // Remove from local state immediately
        setTunnels((prev) => prev.filter((t) => t.id !== tunnelId));
      }
    } catch (err) {
      console.error("Failed to disconnect tunnel:", err);
    }
  };

  const formatConnectedTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Active Tunnels</h1>
          <p className="text-muted-foreground">
            Monitor and manage your active tunnel connections
          </p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Active Tunnels</h1>
          <p className="text-muted-foreground">
            Monitor and manage your active tunnel connections
          </p>
        </div>
        <div className="flex items-center gap-4">
          {lastUpdated && (
            <span className="text-sm text-muted-foreground">
              Updated {formatConnectedTime(lastUpdated.toISOString())}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Card className="mb-4 border-red-200 bg-red-50">
          <CardContent className="py-4">
            <p className="text-sm text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {tunnels.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Radio className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No active tunnels</h3>
            <p className="mb-4 text-center text-sm text-muted-foreground max-w-md">
              Start a tunnel using the CLI to see it here. Run{" "}
              <code className="rounded bg-muted px-1">liveport connect 3000 --key lpk_your_key</code>
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {tunnels.map((tunnel) => (
            <Card key={tunnel.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Badge
                      variant="default"
                      className={
                        tunnel.state === "active"
                          ? "bg-green-500"
                          : "bg-yellow-500"
                      }
                    >
                      <span className="mr-1 h-2 w-2 rounded-full bg-white animate-pulse" />
                      {tunnel.state === "active" ? "Connected" : tunnel.state}
                    </Badge>
                    <span className="text-lg">{tunnel.subdomain}.liveport.dev</span>
                  </CardTitle>
                  <CardDescription>
                    Forwarding to localhost:{tunnel.localPort}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`https://${tunnel.subdomain}.liveport.dev`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open
                    </a>
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDisconnect(tunnel.id)}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Disconnect
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Bridge Key</p>
                    <p className="font-medium">{tunnel.keyName || "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Connected</p>
                    <p className="font-medium">{formatConnectedTime(tunnel.connectedAt)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Requests</p>
                    <p className="font-medium">{tunnel.requestCount.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Auto-refreshes every {REFRESH_INTERVAL / 1000} seconds
      </p>
    </div>
  );
}
