import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function ExperimentDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Experiment</h1>
        <Badge variant="outline">{id}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Placeholder</CardTitle>
          <CardDescription>
            Detail view for experiment <span className="font-medium">{id}</span> in org{" "}
            <span className="font-medium">/{org}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Posterior distribution, arm allocation, agent runs, and decision log render here.
        </CardContent>
      </Card>
    </div>
  );
}
