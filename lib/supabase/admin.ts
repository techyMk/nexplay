// Service-role Supabase client for admin-only queries that need to
// bypass RLS (e.g. reading every feedback row, every user's stats).
// Never import this from client code or shared code that might be
// bundled into the client. Server-only by design.

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function createAdminClient() {
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export const isAdminClientConfigured = Boolean(supabaseUrl && serviceKey);
