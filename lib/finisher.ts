import type { FinisherApiRequest, FinisherDraft } from "@/lib/types";

// Client-side: ask /api/finisher for goodbye-text drafts in the user's voice.
export async function requestFinisher(input: FinisherApiRequest): Promise<FinisherDraft[]> {
  const res = await fetch("/api/finisher", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data.messages as FinisherDraft[];
}
