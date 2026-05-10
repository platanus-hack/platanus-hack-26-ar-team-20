import { redirect } from "next/navigation";

export default async function FeaturesPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  redirect(`/${org}`);
}
