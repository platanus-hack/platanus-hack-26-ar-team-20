"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";

const API_URL = process.env.HELIX_API_URL ?? "http://localhost:8000";

export type AgentName =
  | "brief"
  | "lab"
  | "architect-compose"
  | "fast-forward"
  | "witness"
  | "director"
  | "architect-consolidate";

export type AgentActionResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

async function postJson(
  path: string,
  body?: unknown
): Promise<AgentActionResult> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? "{}" : JSON.stringify(body),
      cache: "no-store",
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      const detail =
        parsed && typeof parsed === "object" && "detail" in parsed
          ? String((parsed as { detail: unknown }).detail)
          : `${res.status} ${res.statusText}`;
      return { ok: false, error: detail };
    }
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function runLab(
  experimentRowId: string,
  problem: unknown,
  orgPath: string
): Promise<AgentActionResult> {
  const body =
    problem === undefined || problem === null ? {} : { problem };
  const result = await postJson(
    `/experiments/${experimentRowId}/lab/run`,
    body
  );
  if (result.ok) revalidatePath(orgPath);
  return result;
}

export async function runArchitectCompose(
  experimentRowId: string,
  orgPath: string
): Promise<AgentActionResult> {
  const result = await postJson(
    `/experiments/${experimentRowId}/architect/compose`
  );
  if (result.ok) revalidatePath(orgPath);
  return result;
}

export async function runFastForward(
  experimentSlug: string,
  orgPath: string
): Promise<AgentActionResult> {
  const result = await postJson(
    `/experiments/${experimentSlug}/fast-forward`,
    { days: 8 }
  );
  if (result.ok) revalidatePath(orgPath);
  return result;
}

// Bumps shipped_at backwards (and flips status='shipped' if not already).
// Used by Run-all between Director and Architect-consolidate.
export async function runFastForwardShipped(
  experimentSlug: string,
  orgPath: string
): Promise<AgentActionResult> {
  const result = await postJson(
    `/demo/fast-forward/${experimentSlug}`,
    { days: 7, target: "shipped_at" }
  );
  if (result.ok) revalidatePath(orgPath);
  return result;
}

export async function runWitness(
  experimentSlug: string,
  orgPath: string
): Promise<AgentActionResult> {
  const result = await postJson(`/experiments/${experimentSlug}/witness/run`);
  if (result.ok) revalidatePath(orgPath);
  return result;
}

export async function runDirector(
  experimentSlug: string,
  orgPath: string
): Promise<AgentActionResult> {
  const result = await postJson(`/experiments/${experimentSlug}/director/run`);
  if (result.ok) revalidatePath(orgPath);
  return result;
}

export async function runArchitectConsolidate(
  experimentSlug: string,
  orgPath: string
): Promise<AgentActionResult> {
  const result = await postJson(
    `/experiments/${experimentSlug}/architect/consolidate`
  );
  if (result.ok) revalidatePath(orgPath);
  return result;
}

export async function runDemoReset(
  orgPath: string
): Promise<AgentActionResult> {
  const result = await postJson("/demo/reset");
  if (result.ok) {
    revalidatePath(orgPath);
    revalidatePath("/", "layout");
  }
  return result;
}

// ---------------------------------------------------------------------------
// Brief — interpret a human prompt into an experiment problem
// ---------------------------------------------------------------------------

export type BriefResponse = {
  interpreted_problem: {
    type: string;
    surface_area: string;
    description: string;
    primary_kpi: string;
    current_value?: number | null;
    target_lift_pp?: number;
    guardrail_kpis?: string[];
  };
  needs_clarification: boolean;
  clarification_options: string[];
  confidence: number;
  notes?: string | null;
};

export type RunBriefResult =
  | { ok: true; data: BriefResponse }
  | { ok: false; error: string };

export async function runBrief(
  humanBrief: string
): Promise<RunBriefResult> {
  const trimmed = humanBrief.trim();
  if (!trimmed) {
    return { ok: false, error: "human_brief is empty" };
  }

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  const { data: userRow } = await supabase
    .from("users")
    .select("org_id")
    .eq("id", user.id)
    .single<{ org_id: string }>();
  if (!userRow?.org_id) return { ok: false, error: "no org for user" };

  const { data: repos } = await supabase
    .from("repos")
    .select("id")
    .eq("org_id", userRow.org_id)
    .order("created_at", { ascending: true })
    .limit(1);
  const repoId = repos?.[0]?.id;
  if (!repoId) return { ok: false, error: "no repo connected to this org" };

  const result = await postJson("/experiments/brief", {
    org_id: userRow.org_id,
    repo_id: repoId,
    human_brief: trimmed,
  });
  if (!result.ok) return result;
  return { ok: true, data: result.data as BriefResponse };
}

// ---------------------------------------------------------------------------
// Persist confirmed problem as a fresh experiment row, then redirect to
// the experiment detail page so the user can drive Lab/Architect/etc.
//
// Goes through the FastAPI backend (service-role key, RLS bypass) instead
// of writing directly via the user's anon-keyed client. The 0001 migration
// only declares `using` policies, so a direct anon insert hits the
// default-deny path.
// ---------------------------------------------------------------------------

export async function createExperimentFromBrief(
  orgSlug: string,
  problem: BriefResponse["interpreted_problem"]
): Promise<{ ok: false; error: string } | void> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not authenticated" };

  const { data: userRow } = await supabase
    .from("users")
    .select("org_id")
    .eq("id", user.id)
    .single<{ org_id: string }>();
  if (!userRow?.org_id) return { ok: false, error: "no org for user" };

  const { data: repos } = await supabase
    .from("repos")
    .select("id")
    .eq("org_id", userRow.org_id)
    .order("created_at", { ascending: true })
    .limit(1);
  const repoId = repos?.[0]?.id;
  if (!repoId) return { ok: false, error: "no repo connected to this org" };

  const created = await postJson("/experiments", {
    problem,
    org_id: userRow.org_id,
    repo_id: repoId,
    source: "human_brief",
  });
  if (!created.ok) return created;

  const data = created.data as { id?: string; experiment_id?: string };
  const experimentSlug = data.experiment_id;
  if (!experimentSlug) {
    return { ok: false, error: "backend did not return experiment_id" };
  }

  revalidatePath(`/${orgSlug}`);
  revalidatePath(`/${orgSlug}/experiments`);
  redirect(`/${orgSlug}/experiments/${experimentSlug}`);
}
