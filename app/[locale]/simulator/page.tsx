/**
 * Simulador de critérios (D3.1): rota oculta para pesquisa, sem link no site e fora dos buscadores.
 * Server component fino: entrega o catálogo e os manifestos ao cliente e envolve tudo no
 * `Pd4WebProvider` (o módulo da obra usa) e num `Suspense`.
 */
import type { Metadata } from "next";
import { Suspense } from "react";
import { Barlow_Semi_Condensed } from "next/font/google";
import { DECLARED_COMPOSITION_MANIFESTS } from "@/components/compositions/compositions-manifests.generated";
import { catalogoHabilitado } from "@/lib/criterios/catalogo";
import { Pd4WebProvider } from "../map3/pd4web-context";
import Simulador from "./simulador";
import s from "./simulador.module.css";

// Serigrafia da placa (D4). O next/font serve o arquivo do próprio site, então o COEP não barra.
const serigrafia = Barlow_Semi_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-serigrafia",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Simulador de critérios",
    robots: { index: false, follow: false },
    // O layout aponta o canonical e os idiomas para o /map3; aqui não há nada a indicar.
    alternates: { canonical: null, languages: {} },
    openGraph: null,
  };
}

export default function SimuladorPage() {
  return (
    <div className={`${serigrafia.variable} ${s.pagina}`}>
      <Pd4WebProvider>
        <Suspense fallback={<p className={s.carregando}>Montando a placa…</p>}>
          <Simulador catalogo={catalogoHabilitado()} manifestos={DECLARED_COMPOSITION_MANIFESTS} />
        </Suspense>
      </Pd4WebProvider>
    </div>
  );
}
