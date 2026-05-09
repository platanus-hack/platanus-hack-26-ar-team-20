import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AuditPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit</h1>
        <p className="text-sm text-muted-foreground">
          Org <span className="font-medium text-foreground">/{org}</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Decisions log</CardTitle>
          <CardDescription>
            Append-only log of every Witness/Architect/Director decision.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Placeholder — wired up in D2.
        </CardContent>
      </Card>
    </div>
  );
}
