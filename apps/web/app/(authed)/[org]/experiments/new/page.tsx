import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewExperimentPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New experiment</h1>
        <p className="text-sm text-muted-foreground">
          Org <span className="font-medium text-foreground">/{org}</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Placeholder</CardTitle>
          <CardDescription>
            Form to define hypothesis, arms, target metric, and guardrails goes here.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Wired up in D2.
        </CardContent>
      </Card>
    </div>
  );
}
