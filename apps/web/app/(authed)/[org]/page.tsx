import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function OrgOverviewPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Org <span className="font-medium text-foreground">/{org}</span>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Active experiments</CardTitle>
            <CardDescription>—</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">0</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Decisions / 24h</CardTitle>
            <CardDescription>—</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">0</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Auto-merged PRs</CardTitle>
            <CardDescription>—</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">0</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Coming in D2</CardTitle>
          <CardDescription>
            Live decisions, recent agent runs, feature timeline.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
