import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

// Deliberately the anon key, not the service role key — every admin
// operation goes through the is_admin()-scoped RLS policies already
// built across the schema, the same way the mobile app relies on RLS
// for students/drivers. The service role key must never reach the
// browser, so it has no reason to exist anywhere in this app.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
