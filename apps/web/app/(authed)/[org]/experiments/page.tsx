import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ExperimentsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Experiments</h1>
          <p className="text-sm text-muted-foreground">
            Active and past experiments.
          </p>
        </div>
        <Button asChild>
          <Link href={`/${org}/experiments/new`}>New experiment</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>No experiments yet</CardTitle>
          <CardDescription>
            Witness will spin these up automatically — or kick off your first manually.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href={`/${org}/experiments/new`}>Create one</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
