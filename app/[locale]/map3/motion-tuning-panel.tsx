"use client";

import { SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import type {
  BasicEulerChannel,
  MotionMappingMethod,
  MotionDiagnostics,
  QuaternionProjectionChannel,
  SensorDebugSnapshot,
  SignedQuaternionComponent,
  MotionTuningSettings,
} from "./use-sensor-smoothing";
import { DEFAULT_MOTION_TUNING_SETTINGS } from "./use-sensor-smoothing";
import { createPortal } from "react-dom";

type MotionTuningPanelProps = {
  settings: MotionTuningSettings;
  diagnostics: MotionDiagnostics;
  sensorDebug: SensorDebugSnapshot;
  co2Threshold: number;
  onChange: (settings: MotionTuningSettings) => void;
  onCo2ThresholdChange: (value: number) => void;
  onReset: () => void;
  onRecalibrate: () => void;
  /** When provided, a simulate button appears in the CO2 Trigger section. */
  onSimulateCo2?: () => void;
  /** Whether the CO2 simulation is currently running. */
  isCo2Simulating?: boolean;
  /** Live ppm value shown while the simulation is running. */
  simulatedCo2Ppm?: number | null;
};

type TuningField = {
  key: NumericTuningKey;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
};

type NumericTuningKey = Exclude<
  keyof MotionTuningSettings,
  | "mappingMethod"
  | "basicLatitudeFrom"
  | "basicLongitudeFrom"
  | "basicBearingFrom"
  | "basicInvertLatitude"
  | "basicInvertLongitude"
  | "basicInvertBearing"
  | "lockBearing"
  | "quaternionRemapW"
  | "quaternionRemapX"
  | "quaternionRemapY"
  | "quaternionRemapZ"
  | "quaternionLatitudeFrom"
  | "quaternionLongitudeFrom"
  | "quaternionBearingFrom"
>;

type TuningPreset = {
  name: string;
  description: string;
  settings: Partial<MotionTuningSettings>;
};

const mappingMethods: { label: string; value: MotionMappingMethod }[] = [
  { label: "Euler", value: "euler" },
  { label: "Quaternion", value: "quaternion" },
  { label: "Basico", value: "basic" },
];

const basicEulerChannelOptions: {
  label: string;
  value: BasicEulerChannel;
}[] = [
  { label: "Guinada (Yaw)", value: "yaw" },
  { label: "Arfagem (Pitch)", value: "pitch" },
  { label: "Rolagem (Roll)", value: "roll" },
];

const signedQuaternionComponentOptions: {
  label: string;
  value: SignedQuaternionComponent;
}[] = [
  { label: "w", value: "w" },
  { label: "x", value: "x" },
  { label: "y", value: "y" },
  { label: "z", value: "z" },
  { label: "-w", value: "-w" },
  { label: "-x", value: "-x" },
  { label: "-y", value: "-y" },
  { label: "-z", value: "-z" },
];

const projectionChannelOptions: {
  label: string;
  value: QuaternionProjectionChannel;
}[] = [
  { label: "Latitude", value: "latitude" },
  { label: "Longitude", value: "longitude" },
  { label: "Rumo", value: "bearing" },
];

const tuningFields: TuningField[] = [
  {
    key: "bufferSize",
    label: "Buffer de mediana",
    description:
      "Quantas amostras recentes do sensor sao usadas no filtro de mediana. Valores maiores rejeitam melhor os picos, mas adicionam mais atraso.",
    min: 1,
    max: 15,
    step: 1,
  },
  {
    key: "calibrationSampleCount",
    label: "Amostras de calibracao",
    description:
      "Quantas amostras entram na media ao calibrar. Valores maiores geram um ponto zero mais estavel, mas a calibracao leva um pouco mais de tempo.",
    min: 1,
    max: 20,
    step: 1,
  },
  {
    key: "emaAlpha",
    label: "Alpha da EMA",
    description:
      "Quao rapido o movimento filtrado acompanha novos valores do sensor. Valores maiores deixam a resposta mais rapida; valores menores deixam mais suave e amortecido.",
    min: 0.01,
    max: 1,
    step: 0.01,
  },
  {
    key: "mapUpdateHz",
    label: "Taxa de atualizacao do mapa",
    description:
      "Com que frequencia o globo digital e atualizado. Taxas maiores podem parecer mais imediatas, mas podem expor mais ruido do sensor.",
    min: 5,
    max: 60,
    step: 1,
    unit: "Hz",
  },
  {
    key: "maxDeltaPerUpdate",
    label: "Passo angular maximo",
    description:
      "Movimento maximo permitido no mapa por atualizacao. Valores menores evitam saltos bruscos; valores maiores fazem o mapa acompanhar mais rapido apos movimentos rapidos.",
    min: 0.1,
    max: 10,
    step: 0.1,
    unit: "deg",
  },
  {
    key: "motionStartThreshold",
    label: "Limiar de inicio do movimento",
    description:
      "Quanto movimento e necessario para o sistema considerar que o globo esta sendo movido intencionalmente. Aumente para ignorar pequenos toques e deriva.",
    min: 0.01,
    max: 4,
    step: 0.01,
    unit: "deg",
  },
  {
    key: "motionStopThreshold",
    label: "Limiar de parada do movimento",
    description:
      "Quao estavel o sensor precisa ficar para o detector de parada comecar a contar. Valores menores exigem uma parada mais limpa; valores maiores param mais cedo.",
    min: 0.01,
    max: 2,
    step: 0.01,
    unit: "deg",
  },
  {
    key: "motionSettleDuration",
    label: "Duracao de assentamento",
    description:
      "Por quanto tempo o baixo movimento deve continuar antes de entrar na fase de assentamento. Valores maiores ajudam com oscilacao e movimento residual.",
    min: 0,
    max: 1500,
    step: 10,
    unit: "ms",
  },
  {
    key: "motionStopDuration",
    label: "Duracao de parada",
    description:
      "Por quanto tempo o baixo movimento deve continuar antes de o popup de clima poder abrir. Valores maiores reduzem paradas falsas; valores menores parecem mais rapidos.",
    min: 50,
    max: 3000,
    step: 10,
    unit: "ms",
  },
  {
    key: "popupHardLockDuration",
    label: "Bloqueio rigido do popup",
    description:
      "Por quanto tempo a entrada do sensor e totalmente ignorada logo apos o popup abrir. Aumente se toques acidentais moverem o globo com muita facilidade.",
    min: 0,
    max: 3000,
    step: 10,
    unit: "ms",
  },
  {
    key: "popupUnlockThreshold",
    label: "Limiar de desbloqueio do popup",
    description:
      "Quao forte deve ser o proximo movimento apos o bloqueio do popup para retomar o controle. Valores maiores exigem um gesto mais deliberado.",
    min: 0.01,
    max: 4,
    step: 0.01,
    unit: "deg",
  },
];

const quaternionOffsetFields: TuningField[] = [
  {
    key: "quaternionLatitudeOffset",
    label: "Offset de latitude",
    description:
      "Aplica um offset fixo ao resultado de latitude do quaternion antes de mover o mapa. Use para corrigir movimento vertical que esteja desviando na diagonal no globo.",
    min: -45,
    max: 45,
    step: 0.1,
    unit: "deg",
  },
  {
    key: "quaternionLongitudeOffset",
    label: "Offset de longitude",
    description:
      "Aplica um offset fixo ao resultado de longitude do quaternion antes de mover o mapa. Use para trazer o movimento de volta ao eixo horizontal esperado.",
    min: -45,
    max: 45,
    step: 0.1,
    unit: "deg",
  },
  {
    key: "quaternionBearingOffset",
    label: "Offset de rumo",
    description:
      "Aplica um offset fixo ao resultado de rumo do quaternion antes de mover o mapa. Use para compensar uma rotacao residual que deixa o globo desalinhado.",
    min: -180,
    max: 180,
    step: 0.1,
    unit: "deg",
  },
];

const tuningPresets: TuningPreset[] = [
  {
    name: "Super estavel",
    description:
      "Amortecimento maximo e protecao de parada mais forte para sensores com ruido.",
    settings: {
      bufferSize: 9,
      calibrationSampleCount: 10,
      emaAlpha: 0.12,
      mapUpdateHz: 24,
      maxDeltaPerUpdate: 1.8,
      motionStartThreshold: 0.8,
      motionStopThreshold: 0.18,
      motionSettleDuration: 280,
      motionStopDuration: 700,
      popupHardLockDuration: 1200,
      popupUnlockThreshold: 1.1,
    },
  },
  {
    name: "Equilibrado",
    description: "Perfil padrao para ajuste geral e primeiros testes.",
    settings: DEFAULT_MOTION_TUNING_SETTINGS,
  },
  {
    name: "Sensivel",
    description:
      "Resposta mais rapida com filtragem mais leve para um controle agil e deliberado.",
    settings: {
      bufferSize: 3,
      calibrationSampleCount: 4,
      emaAlpha: 0.42,
      mapUpdateHz: 45,
      maxDeltaPerUpdate: 5,
      motionStartThreshold: 0.18,
      motionStopThreshold: 0.08,
      motionSettleDuration: 90,
      motionStopDuration: 240,
      popupHardLockDuration: 450,
      popupUnlockThreshold: 0.32,
    },
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundToStep(value: number, step: number) {
  const precision = step.toString().includes(".")
    ? step.toString().split(".")[1].length
    : 0;
  return Number(value.toFixed(precision));
}

const CO2_THRESHOLD_MIN = 300;
const CO2_THRESHOLD_MAX = 10000;
const CO2_THRESHOLD_STEP = 10;

export default function MotionTuningPanel({
  settings,
  diagnostics,
  sensorDebug,
  co2Threshold,
  onChange,
  onCo2ThresholdChange,
  onReset,
  onRecalibrate,
  onSimulateCo2,
  isCo2Simulating = false,
  simulatedCo2Ppm = null,
}: MotionTuningPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const phaseLabel: Record<MotionDiagnostics["phase"], string> = {
    calibrating: "calibrando",
    idle: "parado",
    moving: "em movimento",
    settling: "assentando",
    stopped: "parado",
  };

  const fieldLookup = useMemo(
    () => Object.fromEntries(tuningFields.map((field) => [field.key, field])),
    [],
  ) as Record<keyof MotionTuningSettings, TuningField>;

  function updateSetting(key: keyof MotionTuningSettings, rawValue: number) {
    const field = fieldLookup[key];
    const nextValue = roundToStep(
      clamp(rawValue, field.min, field.max),
      field.step,
    );

    onChange({
      ...settings,
      [key]: nextValue,
    });
  }

  function updateMappingMethod(value: MotionMappingMethod) {
    onChange({
      ...settings,
      mappingMethod: value,
    });
  }

  function updateBasicInversionSetting(
    key: "basicInvertLatitude" | "basicInvertLongitude" | "basicInvertBearing",
    value: boolean,
  ) {
    onChange({
      ...settings,
      [key]: value,
    });
  }

  function updateBearingLock(value: boolean) {
    onChange({
      ...settings,
      lockBearing: value,
    });
  }

  function updateQuaternionRemap(
    key:
      | "quaternionRemapW"
      | "quaternionRemapX"
      | "quaternionRemapY"
      | "quaternionRemapZ",
    value: SignedQuaternionComponent,
  ) {
    onChange({
      ...settings,
      [key]: value,
    });
  }

  function updateProjectionChannel(
    key:
      | "quaternionLatitudeFrom"
      | "quaternionLongitudeFrom"
      | "quaternionBearingFrom",
    value: QuaternionProjectionChannel,
  ) {
    onChange({
      ...settings,
      [key]: value,
    });
  }

  function updateBasicAxisChannel(
    key: "basicLatitudeFrom" | "basicLongitudeFrom" | "basicBearingFrom",
    value: BasicEulerChannel,
  ) {
    onChange({
      ...settings,
      [key]: value,
    });
  }

  function resetQuaternionRemap() {
    onChange({
      ...settings,
      quaternionRemapW: "w",
      quaternionRemapX: "y",
      quaternionRemapY: "-x",
      quaternionRemapZ: "z",
      quaternionLatitudeFrom: "latitude",
      quaternionLongitudeFrom: "longitude",
      quaternionBearingFrom: "bearing",
    });
  }

  function resetQuaternionOffsets() {
    onChange({
      ...settings,
      quaternionLatitudeOffset: 0,
      quaternionLongitudeOffset: 0,
      quaternionBearingOffset: 0,
    });
  }

  function resetBasicMapping() {
    onChange({
      ...settings,
      basicLatitudeFrom: "pitch",
      basicLongitudeFrom: "roll",
      basicBearingFrom: "yaw",
      basicInvertLatitude: false,
      basicInvertLongitude: false,
      basicInvertBearing: false,
    });
  }

  function applyPreset(preset: TuningPreset) {
    onChange({ ...settings, ...preset.settings });
  }

  function updateCo2Threshold(rawValue: number) {
    const nextValue = roundToStep(
      clamp(rawValue, CO2_THRESHOLD_MIN, CO2_THRESHOLD_MAX),
      CO2_THRESHOLD_STEP,
    );
    onCo2ThresholdChange(nextValue);
  }

  return (
    <>
      <div className="absolute right-4 bottom-4 z-20 pointer-events-auto">
        {isOpen ? (
          createPortal(
            <div className="absolute right-4 bottom-4 z-20 pointer-events-auto">
              <Card className="w-[340px] max-h-[70vh] overflow-hidden bg-white/95 backdrop-blur">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        Ajuste de movimento
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-1">
                        Os valores sao aplicados em tempo real. Use recalibrar
                        para zerar a pose atual do globo sem reconectar o
                        Bluetooth.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsOpen(false)}
                    >
                      Fechar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 overflow-y-auto max-h-[calc(70vh-88px)]">
                  <div className="rounded-md border bg-slate-50 p-3 space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Gatilho de CO2
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <label
                          className="text-sm font-medium"
                          htmlFor="co2Threshold"
                        >
                          Limiar de CO2
                        </label>
                        <div className="flex items-center gap-2 w-[124px]">
                          <Input
                            id="co2Threshold"
                            type="number"
                            value={co2Threshold}
                            min={CO2_THRESHOLD_MIN}
                            max={CO2_THRESHOLD_MAX}
                            step={CO2_THRESHOLD_STEP}
                            className="h-8"
                            onChange={(event) =>
                              updateCo2Threshold(Number(event.target.value))
                            }
                          />
                          <span className="text-xs text-muted-foreground w-8 text-right">
                            ppm
                          </span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min={CO2_THRESHOLD_MIN}
                        max={CO2_THRESHOLD_MAX}
                        step={CO2_THRESHOLD_STEP}
                        value={co2Threshold}
                        onChange={(event) =>
                          updateCo2Threshold(Number(event.target.value))
                        }
                        className="w-full accent-emerald-600"
                      />
                      <p className="text-xs text-slate-500 leading-relaxed">
                        A composicao abre quando o CO2 fica acima deste valor e
                        retorna ao mapa quando o CO2 cai abaixo dele.
                      </p>
                      {onSimulateCo2 && (
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            type="button"
                            size="sm"
                            variant={isCo2Simulating ? "secondary" : "outline"}
                            disabled={isCo2Simulating}
                            onClick={onSimulateCo2}
                            className="flex"
                          >
                            {isCo2Simulating
                              ? `Simulando... ${simulatedCo2Ppm != null ? `${simulatedCo2Ppm} ppm` : ""}`
                              : `Simular pico de CO2 (${co2Threshold + 500} -> ${co2Threshold} / 30 s)`}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-md border bg-slate-50 p-3 space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Predefinicoes
                    </div>
                    <div className="grid grid-cols-1 gap-2">
                      {tuningPresets.map((preset) => {
                        const isActive = Object.entries(preset.settings).every(
                          ([key, value]) =>
                            settings[key as keyof MotionTuningSettings] ===
                            value,
                        );

                        return (
                          <button
                            key={preset.name}
                            type="button"
                            onClick={() => applyPreset(preset)}
                            className={`rounded-md border px-3 py-2 text-left transition-colors ${
                              isActive
                                ? "border-sky-300 bg-sky-50"
                                : "bg-white hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium">
                                {preset.name}
                              </span>
                              {isActive && (
                                <span className="text-[11px] font-medium uppercase tracking-wide text-sky-700">
                                  Ativo
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                              {preset.description}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-md border bg-slate-50 p-3 space-y-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Metodo de mapeamento
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {mappingMethods.map((method) => {
                        const isActive =
                          settings.mappingMethod === method.value;
                        return (
                          <button
                            key={method.value}
                            type="button"
                            onClick={() => updateMappingMethod(method.value)}
                            className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                              isActive
                                ? "border-sky-300 bg-sky-50 text-sky-900"
                                : "bg-white hover:bg-slate-50"
                            }`}
                          >
                            {method.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Quaternion mapeia a orientacao diretamente dos quaternions
                      da IMU. Euler usa a transformacao legada por angulos.
                      Basico mapeia yaw/pitch/roll diretamente para os canais do
                      mapa com roteamento configuravel.
                    </p>

                    <div className="space-y-2 pt-1">
                      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Orientacao do norte
                      </div>
                      <button
                        type="button"
                        onClick={() => updateBearingLock(!settings.lockBearing)}
                        className={`w-full rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors ${
                          settings.lockBearing
                            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                            : "bg-white hover:bg-slate-50"
                        }`}
                      >
                        {settings.lockBearing
                          ? "Rumo travado (norte fixo)"
                          : "Rumo destravado (acompanha o movimento)"}
                      </button>
                      <p className="text-[11px] text-slate-500 leading-tight">
                        Mantenha habilitado para evitar rotacionar o norte ao
                        mover o globo.
                      </p>
                    </div>

                    {settings.mappingMethod === "quaternion" && (
                      <div className="space-y-2 rounded-md bg-white border border-sky-100 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Mapeamento por quaternion
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={resetQuaternionRemap}
                              className="h-7 text-xs"
                            >
                              Redefinir mapeamento
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={onRecalibrate}
                              className="h-7 text-xs"
                            >
                              Calibrar
                            </Button>
                          </div>
                        </div>

                        <div className="rounded bg-slate-50 p-2 border border-slate-200 space-y-1.5">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                            Quaternion relativo (w,x,y,z)
                          </div>
                          <div className="grid grid-cols-4 gap-1 text-xs">
                            {sensorDebug.relativeQuaternion ? (
                              <>
                                <div className="bg-white px-1.5 py-1 rounded border border-slate-300 text-center font-mono">
                                  <div className="text-[9px] text-slate-500">
                                    w
                                  </div>
                                  <div>
                                    {sensorDebug.relativeQuaternion.w.toFixed(
                                      3,
                                    )}
                                  </div>
                                </div>
                                <div className="bg-white px-1.5 py-1 rounded border border-slate-300 text-center font-mono">
                                  <div className="text-[9px] text-slate-500">
                                    x
                                  </div>
                                  <div>
                                    {sensorDebug.relativeQuaternion.x.toFixed(
                                      3,
                                    )}
                                  </div>
                                </div>
                                <div className="bg-white px-1.5 py-1 rounded border border-slate-300 text-center font-mono">
                                  <div className="text-[9px] text-slate-500">
                                    y
                                  </div>
                                  <div>
                                    {sensorDebug.relativeQuaternion.y.toFixed(
                                      3,
                                    )}
                                  </div>
                                </div>
                                <div className="bg-white px-1.5 py-1 rounded border border-slate-300 text-center font-mono">
                                  <div className="text-[9px] text-slate-500">
                                    z
                                  </div>
                                  <div>
                                    {sensorDebug.relativeQuaternion.z.toFixed(
                                      3,
                                    )}
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="col-span-4 text-[11px] text-slate-400 text-center py-1">
                                Aguardando dados de quaternion...
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="rounded bg-slate-50 p-2 border border-slate-200 space-y-2">
                          <p className="text-[10px] text-slate-500 leading-tight">
                            O remapeamento manual esta habilitado. Redefinir
                            mapeamento restaura sua referencia de montagem: face
                            para cima, girado 90 graus no sentido anti-horario.
                          </p>
                        </div>

                        <div className="rounded bg-slate-50 p-2 border border-slate-200 space-y-2">
                          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                            <span>Remapeamento do quaternion</span>
                            <div className="group relative inline-flex items-center">
                              <button
                                type="button"
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 hover:text-slate-700"
                                aria-label="Ajuda sobre remapeamento dos componentes do quaternion"
                              >
                                <span className="text-[10px] font-bold leading-none">
                                  ?
                                </span>
                              </button>
                              <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-md border bg-white p-2 text-[11px] normal-case leading-relaxed text-slate-600 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                                Aqui voce escolhe qual componente do sensor vai
                                para cada saida (w, x, y, z). Trocar X/Y/Z ou
                                usar sinal negativo inverte o sentido da
                                rotacao. Ajuste ate o movimento fisico do globo
                                combinar com o movimento no mapa.
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <label className="space-y-1">
                              <span className="text-slate-600">Saida w</span>
                              <select
                                className="w-full h-7 rounded border border-slate-300 bg-white px-2"
                                value={settings.quaternionRemapW}
                                onChange={(event) =>
                                  updateQuaternionRemap(
                                    "quaternionRemapW",
                                    event.target
                                      .value as SignedQuaternionComponent,
                                  )
                                }
                              >
                                {signedQuaternionComponentOptions.map(
                                  (option) => (
                                    <option
                                      key={`qremap-w-${option.value}`}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-slate-600">Saida x</span>
                              <select
                                className="w-full h-7 rounded border border-slate-300 bg-white px-2"
                                value={settings.quaternionRemapX}
                                onChange={(event) =>
                                  updateQuaternionRemap(
                                    "quaternionRemapX",
                                    event.target
                                      .value as SignedQuaternionComponent,
                                  )
                                }
                              >
                                {signedQuaternionComponentOptions.map(
                                  (option) => (
                                    <option
                                      key={`qremap-x-${option.value}`}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-slate-600">Saida y</span>
                              <select
                                className="w-full h-7 rounded border border-slate-300 bg-white px-2"
                                value={settings.quaternionRemapY}
                                onChange={(event) =>
                                  updateQuaternionRemap(
                                    "quaternionRemapY",
                                    event.target
                                      .value as SignedQuaternionComponent,
                                  )
                                }
                              >
                                {signedQuaternionComponentOptions.map(
                                  (option) => (
                                    <option
                                      key={`qremap-y-${option.value}`}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-slate-600">Saida z</span>
                              <select
                                className="w-full h-7 rounded border border-slate-300 bg-white px-2"
                                value={settings.quaternionRemapZ}
                                onChange={(event) =>
                                  updateQuaternionRemap(
                                    "quaternionRemapZ",
                                    event.target
                                      .value as SignedQuaternionComponent,
                                  )
                                }
                              >
                                {signedQuaternionComponentOptions.map(
                                  (option) => (
                                    <option
                                      key={`qremap-z-${option.value}`}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </option>
                                  ),
                                )}
                              </select>
                            </label>
                          </div>
                        </div>

                        <div className="rounded bg-slate-50 p-2 border border-slate-200 space-y-2">
                          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                            <span>Remapeamento dos eixos do mapa</span>
                            <div className="group relative inline-flex items-center">
                              <button
                                type="button"
                                className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 hover:text-slate-700"
                                aria-label="Ajuda sobre remapeamento dos eixos do mapa"
                              >
                                <span className="text-[10px] font-bold leading-none">
                                  ?
                                </span>
                              </button>
                              <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-64 -translate-x-1/2 rounded-md border bg-white p-2 text-[11px] normal-case leading-relaxed text-slate-600 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                                Aqui voce define qual resultado do quaternion
                                controla Latitude, Longitude e Rumo no Mapbox.
                                Se yaw estiver mexendo no eixo errado, troque os
                                campos ate cada movimento fisico responder no
                                eixo esperado.
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-2 text-xs">
                            <label className="space-y-1">
                              <span className="text-slate-600">
                                Latitude vem de
                              </span>
                              <select
                                className="w-full h-7 rounded border border-slate-300 bg-white px-2"
                                value={settings.quaternionLatitudeFrom}
                                onChange={(event) =>
                                  updateProjectionChannel(
                                    "quaternionLatitudeFrom",
                                    event.target
                                      .value as QuaternionProjectionChannel,
                                  )
                                }
                              >
                                {projectionChannelOptions.map((option) => (
                                  <option
                                    key={`qproj-lat-${option.value}`}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-slate-600">
                                Longitude vem de
                              </span>
                              <select
                                className="w-full h-7 rounded border border-slate-300 bg-white px-2"
                                value={settings.quaternionLongitudeFrom}
                                onChange={(event) =>
                                  updateProjectionChannel(
                                    "quaternionLongitudeFrom",
                                    event.target
                                      .value as QuaternionProjectionChannel,
                                  )
                                }
                              >
                                {projectionChannelOptions.map((option) => (
                                  <option
                                    key={`qproj-lng-${option.value}`}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-slate-600">
                                Rumo vem de
                              </span>
                              <select
                                className="w-full h-7 rounded border border-slate-300 bg-white px-2"
                                value={settings.quaternionBearingFrom}
                                onChange={(event) =>
                                  updateProjectionChannel(
                                    "quaternionBearingFrom",
                                    event.target
                                      .value as QuaternionProjectionChannel,
                                  )
                                }
                              >
                                {projectionChannelOptions.map((option) => (
                                  <option
                                    key={`qproj-bearing-${option.value}`}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </div>

                        <div className="rounded bg-slate-50 p-2 border border-slate-200 space-y-1.5">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                            Projecao atual
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 text-xs">
                            <div className="bg-white px-2 py-1 rounded border border-slate-300">
                              <div className="text-[9px] text-slate-500">
                                Latitude
                              </div>
                              <div className="font-mono">
                                {sensorDebug.quaternionProjection
                                  ? `${sensorDebug.quaternionProjection.latitude.toFixed(1)}°`
                                  : "--"}
                              </div>
                            </div>
                            <div className="bg-white px-2 py-1 rounded border border-slate-300">
                              <div className="text-[9px] text-slate-500">
                                Longitude
                              </div>
                              <div className="font-mono">
                                {sensorDebug.quaternionProjection
                                  ? `${sensorDebug.quaternionProjection.longitude.toFixed(1)}°`
                                  : "--"}
                              </div>
                            </div>
                            <div className="bg-white px-2 py-1 rounded border border-slate-300">
                              <div className="text-[9px] text-slate-500">
                                Rumo
                              </div>
                              <div className="font-mono">
                                {sensorDebug.quaternionProjection
                                  ? `${sensorDebug.quaternionProjection.bearing.toFixed(1)}°`
                                  : "--"}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="rounded bg-slate-50 p-2 border border-slate-200 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                              <span>Offset de eixo</span>
                              <div className="group relative inline-flex items-center">
                                <button
                                  type="button"
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 hover:text-slate-700"
                                  aria-label="Ajuda sobre os offsets do quaternion"
                                >
                                  <span className="text-[10px] font-bold leading-none">
                                    ?
                                  </span>
                                </button>
                                <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-72 -translate-x-1/2 rounded-md border bg-white p-2 text-[11px] normal-case leading-relaxed text-slate-600 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                                  Estes offsets somam um ajuste fixo ao
                                  resultado do mapeamento quaternion antes dele
                                  ir para o mapa. Use latitude para corrigir o
                                  desvio vertical, longitude para alinhar o
                                  movimento lateral e bearing para compensar uma
                                  rotação residual. Se o movimento estiver indo
                                  na diagonal, ajuste primeiro latitude e
                                  longitude até o globo responder no eixo certo.
                                </div>
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={resetQuaternionOffsets}
                              className="h-7 text-xs"
                            >
                              Redefinir offsets
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 gap-2 text-xs">
                            {quaternionOffsetFields.map((field) => (
                              <label key={field.key} className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-slate-600">
                                    {field.label}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    {field.unit ?? ""}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Input
                                    id={field.key}
                                    type="number"
                                    value={settings[field.key]}
                                    min={field.min}
                                    max={field.max}
                                    step={field.step}
                                    className="h-8"
                                    onChange={(event) =>
                                      updateSetting(
                                        field.key,
                                        Number(event.target.value),
                                      )
                                    }
                                  />
                                  <input
                                    type="range"
                                    min={field.min}
                                    max={field.max}
                                    step={field.step}
                                    value={settings[field.key]}
                                    onChange={(event) =>
                                      updateSetting(
                                        field.key,
                                        Number(event.target.value),
                                      )
                                    }
                                    className="flex-1 accent-sky-600"
                                  />
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>

                        {!diagnostics.calibrated && (
                          <div className="text-[11px] text-slate-500 text-center py-1">
                            Conecte o Bluetooth e a calibracao sera estabelecida
                            no primeiro pacote de sensor.
                          </div>
                        )}
                      </div>
                    )}

                    {settings.mappingMethod === "basic" && (
                      <div className="space-y-2 rounded-md bg-white border border-sky-100 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Mapeamento basico
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={resetBasicMapping}
                              className="h-7 text-xs"
                            >
                              Redefinir basico
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={onRecalibrate}
                              className="h-7 text-xs"
                            >
                              Calibrar
                            </Button>
                          </div>
                        </div>

                        <div className="rounded bg-slate-50 p-2 border border-slate-200 space-y-2">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">
                            Roteamento dos eixos
                          </div>
                          <div className="grid grid-cols-1 gap-2 text-xs">
                            <label className="space-y-1">
                              <span className="text-slate-600">
                                Latitude vem de
                              </span>
                              <select
                                className="w-full h-7 rounded border border-slate-300 bg-white px-2"
                                value={settings.basicLatitudeFrom}
                                onChange={(event) =>
                                  updateBasicAxisChannel(
                                    "basicLatitudeFrom",
                                    event.target.value as BasicEulerChannel,
                                  )
                                }
                              >
                                {basicEulerChannelOptions.map((option) => (
                                  <option
                                    key={`basic-lat-${option.value}`}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-slate-600">
                                Longitude vem de
                              </span>
                              <select
                                className="w-full h-7 rounded border border-slate-300 bg-white px-2"
                                value={settings.basicLongitudeFrom}
                                onChange={(event) =>
                                  updateBasicAxisChannel(
                                    "basicLongitudeFrom",
                                    event.target.value as BasicEulerChannel,
                                  )
                                }
                              >
                                {basicEulerChannelOptions.map((option) => (
                                  <option
                                    key={`basic-lng-${option.value}`}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-slate-600">
                                Rumo vem de
                              </span>
                              <select
                                className="w-full h-7 rounded border border-slate-300 bg-white px-2"
                                value={settings.basicBearingFrom}
                                onChange={(event) =>
                                  updateBasicAxisChannel(
                                    "basicBearingFrom",
                                    event.target.value as BasicEulerChannel,
                                  )
                                }
                              >
                                {basicEulerChannelOptions.map((option) => (
                                  <option
                                    key={`basic-bearing-${option.value}`}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                        </div>

                        <div className="space-y-2 pt-1">
                          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Inversao dos eixos
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                updateBasicInversionSetting(
                                  "basicInvertLatitude",
                                  !settings.basicInvertLatitude,
                                )
                              }
                              className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                                settings.basicInvertLatitude
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                  : "bg-white hover:bg-slate-50"
                              }`}
                            >
                              Lat
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateBasicInversionSetting(
                                  "basicInvertLongitude",
                                  !settings.basicInvertLongitude,
                                )
                              }
                              className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                                settings.basicInvertLongitude
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                  : "bg-white hover:bg-slate-50"
                              }`}
                            >
                              Lng
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateBasicInversionSetting(
                                  "basicInvertBearing",
                                  !settings.basicInvertBearing,
                                )
                              }
                              className={`rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                                settings.basicInvertBearing
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                  : "bg-white hover:bg-slate-50"
                              }`}
                            >
                              Rumo
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-md border bg-slate-50 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Diagnostico de movimento
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          diagnostics.popupLocked
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {diagnostics.popupLocked
                          ? "Popup bloqueado"
                          : "Popup livre"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded bg-white px-2 py-1.5 border">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Fase
                        </div>
                        <div className="font-medium capitalize">
                          {phaseLabel[diagnostics.phase]}
                        </div>
                      </div>
                      <div className="rounded bg-white px-2 py-1.5 border">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Movimento
                        </div>
                        <div className="font-medium">
                          {diagnostics.motionMagnitude.toFixed(3)} graus
                        </div>
                      </div>
                      <div className="rounded bg-white px-2 py-1.5 border">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Calibrado
                        </div>
                        <div className="font-medium">
                          {diagnostics.calibrated ? "Sim" : "Nao"}
                        </div>
                      </div>
                      <div className="rounded bg-white px-2 py-1.5 border">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Bloqueio restante
                        </div>
                        <div className="font-medium">
                          {Math.round(diagnostics.popupLockRemainingMs)} ms
                        </div>
                      </div>
                    </div>
                  </div>

                  {tuningFields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <label
                            className="text-sm font-medium"
                            htmlFor={field.key}
                          >
                            {field.label}
                          </label>
                          <div className="group relative inline-flex items-center">
                            <button
                              type="button"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 hover:text-slate-700"
                              aria-label={`Mais informacoes sobre ${field.label}`}
                            >
                              <span className="text-[11px] font-bold leading-none">
                                ?
                              </span>
                            </button>
                            <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 w-56 -translate-x-1/2 rounded-md border bg-white p-2 text-xs leading-relaxed text-slate-600 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                              {field.description}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 w-[124px]">
                          <Input
                            id={field.key}
                            type="number"
                            value={settings[field.key]}
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            className="h-8"
                            onChange={(event) =>
                              updateSetting(
                                field.key,
                                Number(event.target.value),
                              )
                            }
                          />
                          <span className="text-xs text-muted-foreground w-8 text-right">
                            {field.unit ?? ""}
                          </span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        value={settings[field.key]}
                        onChange={(event) =>
                          updateSetting(field.key, Number(event.target.value))
                        }
                        className="w-full accent-blue-600"
                      />
                    </div>
                  ))}

                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onReset}
                      className="flex-1"
                    >
                      Restaurar padroes
                    </Button>
                    <Button
                      type="button"
                      onClick={onRecalibrate}
                      className="flex-1"
                    >
                      Recalibrar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>,
            document.body,
          )
        ) : (
          <Button
            type="button"
            variant="outline"
            className="bg-white/95 backdrop-blur"
            onClick={() => setIsOpen(true)}
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Ajustar movimento
          </Button>
        )}
      </div>
    </>
  );
}
