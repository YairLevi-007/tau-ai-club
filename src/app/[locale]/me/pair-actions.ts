"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { UUID } from "@/lib/pair/data";

export type ConfirmResult = { ok: true; at: string | null } | { ok: false };

/** "The meeting happened" (or take it back), for the member's own published conversation. */
export async function confirmMyPair(roundId: string, on: boolean): Promise<ConfirmResult> {
  const viewer = await getViewer();
  const supabase = await createClient();
  if (viewer.kind !== "member" || !supabase || typeof roundId !== "string" || !UUID.test(roundId)) return { ok: false };
  const { data, error } = await supabase.rpc("confirm_my_pair", { p_round_id: roundId, p_on: on === true });
  if (error) return { ok: false };
  revalidatePath("/[locale]/me", "page");
  revalidatePath("/[locale]/admin/pair", "layout");
  return { ok: true, at: typeof data === "string" ? data : null };
}
