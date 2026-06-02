// Cliente Supabase apontando para o projeto do usuário (NÃO Lovable Cloud).
// Este arquivo substitui o client auto-gerado via alias no vite.config.ts.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = 'https://syyxnqzxqabeuqbuptkh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5eXhucXp4cWFiZXVxYnVwdGtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNjEwNTEsImV4cCI6MjA5NTkzNzA1MX0.cHrLm6A5Ym4PNGQ5q1XQt3_XEQZSSH-5kQxB5axZSkc';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
