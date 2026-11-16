import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase com a SERVICE ROLE key: ignora o RLS. Só existe no servidor
 * (o import de "server-only" quebra o build se um componente client o puxar).
 *
 * Substitui lib/usersdb.js, nome herdado da primeira versão do push, que
 * guardava os inscritos no MongoDB. Criado sob demanda, e não no import: antes,
 * importar o módulo sem as variáveis de ambiente derrubava a página inteira do
 * mapa, inclusive a validação de e-mail do formulário.
 */
let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente no ambiente");
  }

  client = createClient(url, serviceKey, { auth: { persistSession: false } });
  return client;
}
