"use server";

import { revalidatePath } from "next/cache";

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
  const result = await postJson(`/experiments/${experimentRowId}/lab/run`, {
    problem,
  });
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
