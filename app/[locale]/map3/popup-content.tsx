import { getTranslations } from "next-intl/server";
import { ReactNode, Suspense } from "react";
import PopupLocationInfo from "./popup-location-info";
import PopupWeatherInfo from "./popup-weather-info";
import PopupFireInfo from "./popup-fire-info";
import PopupLightningInfo from "./popup-lightning-info";

type DataPopupProps = {
  lat: number;
  lng: number;
  lang: string;
  composition?: string;
  children: ReactNode;
};

export default async function PopupContent({
  lat,
  lng,
  lang,
  children,
}: DataPopupProps) {
  const t = await getTranslations("Index");

  return (
    <div>
      <Suspense fallback={<p>{t("compositionInfo.labels.loadingLocation")}</p>}>
        <PopupLocationInfo lat={lat} lng={lng} lang={lang}></PopupLocationInfo>
      </Suspense>
      <Suspense fallback={<p>{t("compositionInfo.labels.loadingWeather")}</p>}>
        <PopupWeatherInfo lat={lat} lon={lng} lang={lang}></PopupWeatherInfo>
      </Suspense>
      <Suspense fallback={null}>
        <PopupFireInfo lat={lat} lon={lng} />
      </Suspense>
      <Suspense fallback={null}>
        <PopupLightningInfo lat={lat} lon={lng} />
      </Suspense>
      <div className="mt-4">{children}</div>
    </div>
  );
}
