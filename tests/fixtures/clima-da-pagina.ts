/**
 * Oráculo: cópia congelada do bloco que monta `clima` em `app/[locale]/map3/page.tsx`, commit
 * 894a0ac (linhas 85-110). Idêntica, exceto que virou função: as três fontes chegam como
 * argumento em vez de virem do `await Promise.all(...)`. Junto com
 * `tests/fixtures/criterio-producao.ts`, reproduz a escolha de obra do site de hoje.
 * Extraído em 2026-11-26. NÃO EDITAR: oráculo.
 */
import type { ClimaData } from "./criterio-producao";

export type FontesDeHoje = {
  weatherData: any;
  lightningData: any;
  fireSpotsData: any;
};

export function climaDaPaginaEm894a0ac({
  weatherData,
  lightningData,
  fireSpotsData,
}: FontesDeHoje): ClimaData {
  const rainData = weatherData?.rain as { "1h"?: number } | undefined;

  // NaN = clima indisponível: o painel imprime "--", o patch não recebe o
  // valor (há um Number.isFinite na frente de cada envio) e o registro grava
  // null — ninguém toca um 24 °C que não foi medido.
  const temp = weatherData?.main.temp ?? NaN;
  const speed = weatherData?.wind.speed ?? NaN;
  const humidity = weatherData?.main.humidity ?? NaN;
  // null = a fonte não respondeu. Distinto de 0, que significa "consultamos e não
  // há nada". Antes os dois casos colapsavam em 0, e uma queda do backend ficava
  // indistinguível de céu calmo — inclusive no registro de pesquisa.
  const lightningcount = lightningData?.count ?? null;
  const firecount = fireSpotsData?.count ?? null;

  // A escolha automática de composição precisa de números. Tratar indisponível
  // como zero aqui é deliberado e conservador: sem sinal, nenhuma obra de
  // tempestade ou de fogo dispara. Quem conta a verdade ao público é o painel.
  const clima = {
    windSpeed: Number.isFinite(speed) ? speed : 0,
    humidity: Number.isFinite(humidity) ? humidity : 0,
    clouds: weatherData?.clouds ?? 0,
    temperature: Number.isFinite(temp) ? temp : 0,
    lightnings: lightningcount ?? 0,
    fireSpots: firecount ?? 0,
    rain: rainData?.["1h"] ?? 0,
  };

  return clima;
}
