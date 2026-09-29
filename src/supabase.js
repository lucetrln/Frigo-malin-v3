import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Sans configuration, le site fonctionne en mode invité (stockage local uniquement).
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export async function loadUserData(userId) {
  const { data, error } = await supabase
    .from("frigo_data")
    .select("fridge, prefs, selected")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveUserData(userId, { fridge, prefs, selected }) {
  const { error } = await supabase
    .from("frigo_data")
    .upsert({ user_id: userId, fridge, prefs, selected, updated_at: new Date().toISOString() });
  if (error) throw error;
}
