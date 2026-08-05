import { getFireSpots } from "@/components/getData";
import { Flame, CloudOff } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function PopupFireInfo({
  lat,
  lon,
}: {
  lat: number | string;
  lon: number | string;
}) {
  const fireData = await getFireSpots(lat.toString(), lon.toString(), 100);
  const t = await getTranslations("Index");

  // Three states, not two. `null` means NASA FIRMS did not answer, and saying
  // nothing would let an outage pass for an area with no fires — the same
  // silence this component used to produce.
  if (fireData === null) {
    return (
      <div className="mt-2">
        <div className="flex items-end gap-1 italic opacity-70">
          <CloudOff size={20} />
          <p>
            {t("compositionInfo.labels.firesPlural")}:{" "}
            {t("compositionInfo.labels.unavailable")}
          </p>
        </div>
      </div>
    );
  }

  if (fireData.count === 0) return null;

  return (
    <div className="mt-2">
      <div className="flex items-end gap-1">
        <Flame size={20} />
        <p>
          {fireData.count} fire spot{fireData.count !== 1 ? "s" : ""} nearby
        </p>
      </div>
    </div>
  );
}
