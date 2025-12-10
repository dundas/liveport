"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Key, Trash2, Loader2, XCircle } from "lucide-react";
import { CreateKeyDialog } from "@/components/keys/create-key-dialog";

interface BridgeKeyResponse {
  id: string;
  name: string;
  prefix: string;
  status: "active" | "revoked" | "expired";
  expiresAt: string;
  maxUses: number | null;
  currentUses: number;
  allowedPort: number | null;
  createdAt: string;
  updatedAt: string;
}

export default function KeysPage() {
  const [keys, setKeys] = useState<BridgeKeyResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const response = await fetch("/api/keys");
      if (!response.ok) {
        throw new Error("Failed to fetch keys");
      }
      const data = await response.json();
      setKeys(data.keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch keys");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      const response = await fetch(`/api/keys/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to revoke key");
      }
      // Refresh the list
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
    } finally {
      setRevokingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const response = await fetch(`/api/keys/${id}?permanent=true`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete key");
      }
      // Refresh the list
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete key");
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusBadge = (key: BridgeKeyResponse) => {
    const now = new Date();
    const expiresAt = new Date(key.expiresAt);
    
    if (key.status === "revoked") {
      return <Badge variant="destructive">Revoked</Badge>;
    }
    if (expiresAt < now) {
      return <Badge variant="secondary">Expired</Badge>;
    }
    return <Badge variant="default">Active</Badge>;
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Bridge Keys</h1>
          <p className="text-muted-foreground">
            Manage your bridge keys for CLI and agent authentication
          </p>
        </div>
        <CreateKeyDialog onKeyCreated={fetchKeys} />
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-destructive/10 p-4 text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your Keys</CardTitle>
          <CardDescription>
            Bridge keys are used to authenticate tunnel connections
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Key className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No bridge keys yet</h3>
              <p className="mb-4 text-center text-sm text-muted-foreground">
                Create a bridge key to start using LivePort with your CLI or agents
              </p>
              <CreateKeyDialog onKeyCreated={fetchKeys} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uses</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell>
                      <code className="rounded bg-muted px-2 py-1 text-sm font-mono">
                        {key.prefix}...
                      </code>
                    </TableCell>
                    <TableCell>{getStatusBadge(key)}</TableCell>
                    <TableCell>
                      {key.currentUses}
                      {key.maxUses ? ` / ${key.maxUses}` : ""}
                    </TableCell>
                    <TableCell>{formatDate(key.expiresAt)}</TableCell>
                    <TableCell>{formatDate(key.createdAt)}</TableCell>
                    <TableCell className="text-right space-x-1">
                      {key.status === "active" && new Date(key.expiresAt) > new Date() && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRevoke(key.id)}
                          disabled={revokingId === key.id}
                          title="Revoke key"
                        >
                          {revokingId === key.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(key.id)}
                        disabled={deletingId === key.id}
                        title="Delete key permanently"
                        className="text-destructive hover:text-destructive"
                      >
                        {deletingId === key.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
