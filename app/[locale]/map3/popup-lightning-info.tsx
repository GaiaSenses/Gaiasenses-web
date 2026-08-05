import { getLightning } from "@/components/getData";
import { Zap, CloudOff } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function PopupLightningInfo({
  lat,
  lon,
}: {
  lat: number | string;
  lon: number | string;
}) {
  const lightningData = await getLightning(lat.toString(), lon.toString(), 100);
  const t = await getTranslations("Index");

  // Three states, not two. `null` means the GOES pipeline did not answer, and
  // staying silent would let an outage pass for a calm sky — which is exactly
  // how a whole day of zeros became impossible to explain.
  if (lightningData === null) {
    return (
      <div className="mt-2">
        <div className="flex items-end gap-1 italic opacity-70">
          <CloudOff size={20} />
          <p>
            {t("compositionInfo.labels.lightnings")}:{" "}
            {t("compositionInfo.labels.unavailable")}
          </p>
        </div>
      </div>
    );
  }

  if (lightningData.count === 0) return null;

  return (
    <div className="mt-2">
      <div className="flex items-end gap-1">
        <Zap size={20} />
        <p>
          {t("compositionInfo.labels.lightningNearby", {
            count: lightningData.count,
          })}
        </p>
      </div>
    </div>
  );
}
