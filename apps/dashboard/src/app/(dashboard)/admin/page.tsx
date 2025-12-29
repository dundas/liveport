import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { isUserSuperuser } from "@/lib/superuser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AdminPage() {
  // Verify superuser access
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session?.user) {
    redirect("/login");
  }

  if (!isUserSuperuser(session.user)) {
    redirect("/dashboard");
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Superuser administration and monitoring
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Superuser Access
              <Badge variant="default">Active</Badge>
            </CardTitle>
            <CardDescription>
              You have unlimited access to all LivePort features
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
              <li>Unlimited tunnel hours</li>
              <li>Unlimited bandwidth</li>
              <li>No rate limits</li>
              <li>Priority support</li>
              <li>Access to admin features</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Admin Features</CardTitle>
            <CardDescription>
              Additional administrative features coming soon
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Future admin features will be available here:
            </p>
            <ul className="list-disc list-inside mt-2 space-y-1 text-sm text-muted-foreground">
              <li>User management</li>
              <li>System monitoring</li>
              <li>Usage analytics</li>
              <li>Audit logs</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
