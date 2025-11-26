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
import { Plus, Key, Trash2 } from "lucide-react";

export default function KeysPage() {
  // Placeholder data - will be fetched from API
  const keys: Array<{
    id: string;
    name: string;
    prefix: string;
    status: "active" | "revoked";
    createdAt: string;
    lastUsed: string | null;
  }> = [];

  return (
    <div className="p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Bridge Keys</h1>
          <p className="text-muted-foreground">
            Manage your bridge keys for CLI and agent authentication
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Create Key
        </Button>
      </div>

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
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Key
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-2 py-1 text-sm">
                        {key.prefix}...
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant={key.status === "active" ? "default" : "secondary"}>
                        {key.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{key.createdAt}</TableCell>
                    <TableCell>{key.lastUsed || "Never"}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        <Trash2 className="h-4 w-4" />
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
