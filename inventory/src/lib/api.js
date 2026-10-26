import { createSupabaseApi } from "./supabaseApi.js";
import { createDemoApi } from "./demoApi.js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// With Supabase keys → live shared database. Without → demo in this browser.
export const api = url && key ? createSupabaseApi(url, key) : createDemoApi();
