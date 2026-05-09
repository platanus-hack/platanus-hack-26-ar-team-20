import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function FeaturesPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Features</h1>
        <p className="text-sm text-muted-foreground">
          Org <span className="font-medium text-foreground">/{org}</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Feature flags</CardTitle>
          <CardDescription>
            Live PostHog flags, roll-out %, and Architect cleanup status.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Placeholder — wired up in D2.
        </CardContent>
      </Card>
    </div>
  );
}
