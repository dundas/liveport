import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Radio, ExternalLink, XCircle } from "lucide-react";

export default function TunnelsPage() {
  // Placeholder data - will be fetched from API/Redis
  const tunnels: Array<{
    id: string;
    subdomain: string;
    localPort: number;
    keyName: string;
    connectedAt: string;
    requestCount: number;
  }> = [];

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Active Tunnels</h1>
        <p className="text-muted-foreground">
          Monitor and manage your active tunnel connections
        </p>
      </div>

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
                    <Badge variant="default" className="bg-green-500">
                      <span className="mr-1 h-2 w-2 rounded-full bg-white animate-pulse" />
                      Connected
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
                  <Button variant="destructive" size="sm">
                    <XCircle className="mr-2 h-4 w-4" />
                    Disconnect
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Bridge Key</p>
                    <p className="font-medium">{tunnel.keyName}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Connected</p>
                    <p className="font-medium">{tunnel.connectedAt}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Requests</p>
                    <p className="font-medium">{tunnel.requestCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
