import { Button } from "@/components/ui/button";
import GaiasensesMap from "./gaiasenses-map";
import PopupContent from "./popup-content";
import Link from "next/link";
import CompositionModal from "./composition-modal";
import CompositionsInfo, {
  CompositionsInfoType,
} from "@/components/compositions/compositions-info";
import TitleScreen from "./title-screen";
import { getTranslations } from "next-intl/server";
import { CompositionDropdown } from "./composition-dropdown";
import InfoModal from "./info-modal";
import {
  getBrightness,
  getFireSpots,
  getLightning,
  getWeather,
  reverseGeocode,
} from "@/components/getData";
import { cookies } from "next/headers";
import DataSender from "@/components/dataSender";
import { Suspense } from "react";
import { getCompositionForClima } from "./use-composition-queue";
import { Pd4WebProvider } from "./pd4web-context";

function stringToBoolean(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  switch (value.toLowerCase().trim()) {
    case "true":
    case "yes":
    case "1":
      return true;
    case "false":
    case "no":
    case "0":
    case null:
      return false;
    default:
      return false;
  }
}

const compositionOptions = Object.entries(CompositionsInfo).map(
  (item) => item[0],
);

const DEFAULT_COMPOSITION = "attractor";

type PageProps = {
  params: { locale: string; url: string };
  searchParams: {
    lat?: string;
    lng?: string;
    composition?: string;
    mode?: string;
    info?: string;
  };
};

export default async function Page({ params, searchParams }: PageProps) {
  const t = await getTranslations("Index");

  const lat = parseFloat(searchParams.lat ?? "0");
  const lng = parseFloat(searchParams.lng ?? "0");
  const isInfoOpen = stringToBoolean(searchParams.info);

  let userLocation = { lat: 0, lng: 0 };
  const cookieStore = cookies();
  const userLocationCookie = cookieStore.get("userLocation");
  if (userLocationCookie) {
    try {
      userLocation = JSON.parse(userLocationCookie.value);
    } catch {
      userLocation = { lat: 0, lng: 0 };
    }
  }

  //Stubs
  // const weatherData = {
  //   city: "Open Weather API",
  //   clouds: 30,
  //   lat: 0,
  //   lon: 0,
  //   main: {
  //     feels_like: 24,
  //     humidity: 30,
  //     pressure: 20,
  //     temp: 24,
  //     grnd_level: 0,
  //   },
  //   rain: {},
  //   state: "Open weather API",

  //   visibility: 100,
  //   weather: [
  //     {
  //       description: "indisponível",
  //       icon: "indisponível",
  //       main: "indisponível",
  //     },
  //   ],
  //   wind: {
  //     deg: 90,
  //     gust: 40,
  //     speed: 30,
  //   },
  // };
  // const lightningData = { count: 0 };
  // const fireSpotsData = { count: 0 };
  const [weatherData, lightningData, fireSpotsData] = await Promise.all([
    getWeather(lat, lng),
    getLightning(lat.toString(), lng.toString(), 100),
    getFireSpots(lat.toString(), lng.toString(), 100),
  ]);

  const rainData = weatherData.rain as { "1h"?: number } | undefined;

  const temp = weatherData.main.temp;
  const speed = weatherData.wind.speed;
  const humidity = weatherData.main.humidity;
  const lightningcount = lightningData?.count || 0;
  const firecount = fireSpotsData?.count || 0;
  const clima = {
    windSpeed: speed,
    humidity,
    clouds: weatherData.clouds,
    temperature: temp,
    lightnings: lightningcount,
    fireSpots: firecount,
  };

  const requestedComposition = searchParams.composition;
  const hasRequestedComposition =
    typeof requestedComposition === "string" &&
    compositionOptions.includes(requestedComposition);
  const suggestedComposition =
    getCompositionForClima(clima)[0] ?? DEFAULT_COMPOSITION;
  const composition: string = hasRequestedComposition
    ? requestedComposition
    : suggestedComposition;

  const newQuery = {
    ...searchParams,
    composition,
    mode: "player",
    play: true,
  };

  const compositionComponent =
    searchParams.mode === "player"
      ? CompositionsInfo[composition as keyof CompositionsInfoType].Component({
          lat: lat.toString(),
          lon: lng.toString(),
          today: true,
          play: true,
        })
      : null;
  //const pressure = weatherData.main.pressure;
  //const pressure_grnd_level = weatherData.main.grnd_level;
  //const visibility = weatherData.visibility;
  //const description = weatherData.weather[0].description;
  const date_timeplayed = new Date().toISOString();
  const pinnedlocation = {
    lat: lat,
    lng: lng,
  };
  let lang = params.locale;
  const reverseGeocodeData = await reverseGeocode(lat, lng);
  if (lang === "en") lang = "en-us";
  if (lang === "pt") lang = "pt-br";
  const regionNames = new Intl.DisplayNames([lang], {
    type: "region",
  });
  const locationInfo = {
    name: reverseGeocodeData?.name || " ",
    state: reverseGeocodeData?.state || "",
    country:
      (reverseGeocodeData?.country
        ? regionNames.of(reverseGeocodeData.country)
        : " ") || "",
  };
  return (
    <Pd4WebProvider>
      <div className="grid grid-cols-1 grid-rows-1">
        <div className="col-start-1 row-start-1 isolate">
          <GaiasensesMap
            initialLat={lat}
            initialLng={lng}
            locationInfo={locationInfo}
            weatherLabels={{
              temperature: t("compositionInfo.labels.temperature"),
              humidity: t("compositionInfo.labels.humidity"),
              clouds: t("compositionInfo.labels.clouds"),
              wind: t("compositionInfo.labels.wind"),
              direction: t("compositionInfo.labels.direction"),
              gust: t("compositionInfo.labels.gust"),
              rain: t("compositionInfo.labels.rain"),
              co2: t("compositionInfo.labels.co2"),
              lightnings: t("compositionInfo.labels.lightnings"),
              firesSingular: t("compositionInfo.labels.firesSingular"),
              firesPlural: t("compositionInfo.labels.firesPlural"),
            }}
            mode={searchParams.mode === "player" ? "player" : "map"}
            composition={composition}
            InfoButtonText={t("infoButtonText")}
            clima={clima}
            weatherSummary={{
              description:
                weatherData.weather[0]?.description ?? "indisponivel",
              temperature: weatherData.main.temp,
              humidity: weatherData.main.humidity,
              clouds: weatherData.clouds,
              windSpeed: weatherData.wind.speed,
              windDeg: weatherData.wind.deg,
              windGust: weatherData.wind.gust ?? weatherData.wind.speed,
              rain1h: rainData?.["1h"] ?? 0,
            }}
          >
            <Suspense
              fallback={
                <div>
                  <p>Loading...</p>
                </div>
              }
            >
              <PopupContent lat={lat} lng={lng} lang={params.locale}>
                <CompositionDropdown
                  searchParams={{ ...searchParams, composition }}
                ></CompositionDropdown>
              </PopupContent>
            </Suspense>
          </GaiasensesMap>
        </div>
        <div className="col-start-1 row-start-1">
          <TitleScreen
            show={true}
            title={t("title")}
            subtitle={""}
            titleButtonText={t("titleButtonText")}
          ></TitleScreen>
        </div>
        <DataSender
          isOpen={searchParams.mode === "player"}
          composition={composition}
          temp={temp}
          speed={speed}
          humidity={humidity}
          lightningcount={lightningcount}
          firecount={firecount}
          date_timeplayed={date_timeplayed}
          pinnedlocation={pinnedlocation}
          userLocation={userLocation}
        />
        <CompositionModal
          isOpen={searchParams.mode === "player" ? true : false}
          closeButton={
            <Link href={{ query: { ...newQuery, mode: "map" } }}>
              <Button>Back</Button>
            </Link>
          }
        >
          {compositionComponent}
        </CompositionModal>
        <InfoModal
          isOpen={isInfoOpen}
          closeButton={
            <Link href={{ query: { ...searchParams, info: false } }} replace>
              X
            </Link>
          }
        >
          <div className="max-w-lg flex flex-col gap-4 pb-8 text-lg text-justify mx-auto">
            <h1 className="text-5xl font-bold text-center py-12">GaiaSenses</h1>

            <p>{t("aboutTextp1")}</p>

            <p>{t("aboutTextp2")}</p>

            <h2 className="text-2xl font-bold">{t("creditsText")}</h2>

            <div>
              <p className="font-bold">{t("ctiText")}</p>
              <p className="italic">{t("discfText")}</p>
            </div>

            <div>
              <p className="font-bold">{t("coordinatorText")}</p>
              <p>Artemis Moroni</p>
            </div>

            <div>
              <p className="font-bold">{t("development")}</p>
              <p>Felipe Mammoli</p>
              <p>Henrique Cazarim</p> <p>Lucas de Oliveira</p>
              <p>Álvaro Costa</p> <p>Pedro Trama</p> <p>Lucas Mielle</p>
            </div>

            <div>
              <p className="font-bold">{t("sound")}</p>
              <p>Gabriel D&apos;Incao</p> <p>Laureana Stelmastchuk</p>
            </div>

            <div>
              <p className="font-bold">{t("acknowledgement")}</p>
              <p>{t("acknowledgementText")}</p>
            </div>
            <div>
              <p className="font-bold">{t("compositionCredits")}</p>
              {Object.entries(CompositionsInfo).map((value, index) => (
                <div className="flex" key={index}>
                  <Link
                    className={`hover:underline ${
                      value[1].openProcessingLink ? "" : "pointer-events-none"
                    }`}
                    href={value[1].openProcessingLink ?? ""}
                    aria-disabled={value[1].openProcessingLink ? false : true}
                    target="blank"
                  >
                    {value[1].name}, <span>{value[1].author}</span>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </InfoModal>
      </div>
    </Pd4WebProvider>
  );
}
