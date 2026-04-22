import { supabase } from "@/integrations/supabase/client";

export type LookupTable = "categories" | "units";

export interface ManagedListItem {
  id: string;
  name: string;
  active: boolean;
  is_default: boolean;
}

export async function fetchManagedList(table: LookupTable): Promise<ManagedListItem[]> {
  const primary = await supabase
    .from(table)
    .select("id, name, active, is_default")
    .order("name");

  if (!primary.error && primary.data) {
    return primary.data as ManagedListItem[];
  }

  const fallback = await supabase
    .from(table)
    .select("id, name")
    .order("name");

  if (fallback.error) {
    throw fallback.error;
  }

  return (fallback.data ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    active: true,
    is_default: false,
  }));
}

export async function fetchActiveNames(table: LookupTable): Promise<string[]> {
  const primary = await supabase
    .from(table)
    .select("name")
    .eq("active", true)
    .order("name");

  if (!primary.error && primary.data) {
    return primary.data.map((item) => item.name);
  }

  const fallback = await supabase
    .from(table)
    .select("name")
    .order("name");

  if (fallback.error) {
    throw fallback.error;
  }

  return (fallback.data ?? []).map((item) => item.name);
}

export async function fetchActiveOptions(table: LookupTable): Promise<Array<{ id: string; name: string }>> {
  const primary = await supabase
    .from(table)
    .select("id, name")
    .eq("active", true)
    .order("name");

  if (!primary.error && primary.data) {
    return primary.data;
  }

  const fallback = await supabase
    .from(table)
    .select("id, name")
    .order("name");

  if (fallback.error) {
    throw fallback.error;
  }

  return fallback.data ?? [];
}