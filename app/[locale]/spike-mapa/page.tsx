"use client";

/**
 * Spike: o globo do MapLibre serve como substituto do Mapbox?
 *
 * Esta página não faz parte do produto. Ela existe para responder à única
 * pergunta técnica aberta em docs/mapa-alternativas.md — se a projeção em globo
 * do MapLibre fica boa o bastante para o GaiaSenses, onde girar o planeta é a
 * interação central e não enfeite.
 *
 * O que ela mostra é o basemap e a projeção, lado a lado com o que a produção
 * usa hoje. Nada de patch, sensor ou composição: se o globo não convencer aqui,
 * não adianta migrar o resto.
 *
 * Nenhum token: o OpenFreeMap não pede cadastro, chave nem cartão — que é
 * exatamente o impasse que este caminho tenta resolver.
 *
 * RESULTADO (agosto de 2026): o globo funciona. O que não vem junto é o visual
 * de planeta — oceano azul, atmosfera, estrelas, rótulos de país no zoom 2. O
 * estilo `standard` do Mapbox traz tudo isso de fábrica; os do OpenFreeMap são
 * pensados para mapa plano de rua e desenham o oceano quase branco.
 *
 * Tentei fechar a diferença aqui com `setSky` e sobrescrita das camadas `water`
 * e `background`, e nenhuma das duas surtiu efeito nesta montagem — os nomes de
 * camada do liberty não batem e o prop `sky` não é repassado pelo react-map-gl
 * v8. Não insisti: contornar isso é trabalho de estilo próprio, e merece ser
 * dimensionado como tal em vez de virar remendo dentro de um spike.
 */

import { useState } from "react";
import Map, { NavigationControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

/** Estilos do OpenFreeMap. Sem chave, sem conta. */
const ESTILOS = {
  liberty: {
    url: "https://tiles.openfreemap.org/styles/liberty",
    descricao: "Mais próximo do Mapbox Streets — cores fortes, muitos rótulos",
  },
  bright: {
    url: "https://tiles.openfreemap.org/styles/bright",
    descricao: "Claro e limpo, contraste alto",
  },
  positron: {
    url: "https://tiles.openfreemap.org/styles/positron",
    descricao: "Discreto, cinza — deixa o dado em cima aparecer",
  },
} as const;

type EstiloId = keyof typeof ESTILOS;

export default function SpikeMapa() {
  const [estilo, setEstilo] = useState<EstiloId>("liberty");

  return (
    <div className="flex h-screen w-screen flex-col bg-neutral-900 text-neutral-100">
      <header className="flex flex-wrap items-center gap-3 px-4 py-3">
        <h1 className="text-sm font-semibold">
          Spike — MapLibre + OpenFreeMap, projeção em globo
        </h1>
        <div className="flex gap-2">
          {(Object.keys(ESTILOS) as EstiloId[]).map((id) => (
            <button
              key={id}
              onClick={() => setEstilo(id)}
              className={`rounded px-3 py-1 text-xs ${
                estilo === id
                  ? "bg-neutral-100 text-neutral-900"
                  : "bg-neutral-700 text-neutral-100"
              }`}
            >
              {id}
            </button>
          ))}
        </div>
        <p className="text-xs text-neutral-400">{ESTILOS[estilo].descricao}</p>
      </header>

      <div className="relative flex-1">
        <Map
          // A chave força a remontagem ao trocar de estilo: o objetivo aqui é
          // comparar cada um partindo do mesmo estado, não testar transição.
          key={estilo}
          initialViewState={{ latitude: -23.55, longitude: -46.63, zoom: 2 }}
          mapStyle={ESTILOS[estilo].url}
          // O globo não vem no style do OpenFreeMap, então é ligado aqui. É
          // esta linha que o spike está testando; o resto é moldura.
          projection={{ type: "globe" }}
        >
          <NavigationControl />
        </Map>
      </div>

      <footer className="px-4 py-2 text-xs text-neutral-400">
        Produção hoje: Mapbox GL JS v3, estilo proprietário{" "}
        <code>mapbox/standard</code>, com token de uma conta que não é do
        projeto. Compare em <code>/pt/map3</code>.
      </footer>
    </div>
  );
}
