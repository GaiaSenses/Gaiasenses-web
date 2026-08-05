import { supabase } from "./supabaseClient";

/**
 * Which deployment produced this log row.
 *
 * Vercel sets NEXT_PUBLIC_VERCEL_ENV to "production" | "preview" | "development".
 * Preview deployments are public (deployment protection is off, so musicians can
 * audition patch PRs without logging in), which means preview traffic — test
 * sessions, crawlers — reaches the same Supabase project as production. Without
 * this column those rows are indistinguishable from real audience data and would
 * silently contaminate the research corpus.
 *
 * Always filter on `origin = 'production'` when analysing GaiaLogs.
 *
 * Needs this column on the GaiaLogs table:
 *   alter table "GaiaLogs" add column if not exists origin text not null default 'unknown';
 *
 * The migration is NOT a deploy prerequisite: if the column is missing, the row
 * is written without it and a warning is logged (see insertSatelliteData). Once
 * the column exists, tagging starts on its own — no redeploy needed.
 */
const LOG_ORIGIN = process.env.NEXT_PUBLIC_VERCEL_ENV ?? "local";

/**
 * PostgREST answers PGRST204 ("Could not find the '<column>' column of
 * '<table>' in the schema cache") when a payload names a column the table does
 * not have. Older versions only set the message, so both are checked.
 */
function isMissingColumnError(
  error: { code?: string; message?: string },
  column: string,
) {
  return (
    error.code === "PGRST204" ||
    Boolean(error.message?.includes(`'${column}' column`))
  );
}

export async function insertSatelliteData({
  name,
  temperature,
  wind_speed,
  humidity,
  lightning_count,
  fire_count,
  date_timeplayed,
  pinnedlocation,
  userlocation,
  timeSpent,
}: {
  name: string;
  temperature: number;
  wind_speed: number;
  humidity: number;
  lightning_count: number | null;
  fire_count: number | null;
  date_timeplayed: string;
  pinnedlocation: {
    lat: number;
    lng: number;
  };
  userlocation: {
    userlat: number;
    userlng: number;
  };
  timeSpent: number;
}) {
  const row = {
    name,
    temperature,
    humidity: Math.round(humidity),
    wind_speed,
    lightning_count,
    fireSpots_count: fire_count,
    date_timeplayed,
    pinnedlocation,
    userlocation,
    timeSpent,
  };

  let { data, error } = await supabase
    .from("GaiaLogs")
    .insert([{ ...row, origin: LOG_ORIGIN }]);

  if (error && isMissingColumnError(error, "origin")) {
    console.warn(
      "A coluna 'origin' não existe na tabela GaiaLogs — gravando sem ela. " +
        "Registros de preview ficarão indistinguíveis dos de produção até a migração rodar: " +
        `alter table "GaiaLogs" add column if not exists origin text not null default 'unknown';`,
    );
    ({ data, error } = await supabase.from("GaiaLogs").insert([row]));
  }

  if (error) {
    console.error("Erro ao inserir dados no Supabase:", error.message);
    throw error;
  }
  console.log("Dados inseridos com sucesso no Supabase:", data);
  return data;
}
