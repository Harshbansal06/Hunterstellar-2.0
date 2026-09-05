const supabase = require("./supabaseClient");
const TABLE = "teams";

const ensureSupabase = () => {
  if (!supabase) {
    return { data: null, error: { message: "Supabase client not configured." } };
  }
  return null;
};

const getAll = async () => {
  const missing = ensureSupabase();
  if (missing) return missing;
  const { data, error } = await supabase.from(TABLE).select("*");
  return { data, error };
};

const getById = async (id) => {
  const missing = ensureSupabase();
  if (missing) return missing;
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).single();
  return { data, error };
};

const create = async (row) => {
  const missing = ensureSupabase();
  if (missing) return missing;
  const { data, error } = await supabase.from(TABLE).insert(row).select().single();
  return { data, error };
};

const update = async (id, row) => {
  const missing = ensureSupabase();
  if (missing) return missing;
  const { data, error } = await supabase
    .from(TABLE)
    .update(row)
    .eq("id", id)
    .select()
    .single();
  return { data, error };
};

const remove = async (id) => {
  const missing = ensureSupabase();
  if (missing) return missing;
  const { data, error } = await supabase.from(TABLE).delete().eq("id", id);
  return { data, error };
};

const getByTeamName = async (teamName) => {
  const missing = ensureSupabase();
  if (missing) return missing;
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("team_name", teamName)
    .maybeSingle();
  return { data, error };
};

module.exports = { getAll, getById, create, update, remove, getByTeamName };
