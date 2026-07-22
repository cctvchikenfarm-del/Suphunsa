import { createClient } from '@supabase/supabase-js'
import { apiFetch } from '../api.js'

let authClientPromise

export function getAuthClient() {
  if (!authClientPromise) {
    authClientPromise = apiFetch('/api/auth/config').then(({ supabaseUrl, supabaseAnonKey }) => createClient(
      supabaseUrl,
      supabaseAnonKey,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: true } }
    ))
  }
  return authClientPromise
}
