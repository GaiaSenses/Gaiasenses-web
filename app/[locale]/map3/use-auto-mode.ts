import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ViewStateChangeEvent, MapRef } from "react-map-gl/mapbox";
import { locations, type MapLocation } from "./map-constants";

const TIMEOUT_1_PAUSE = 5000;
const TIMEOUT_2_PAUSE = 20000;
const TIMEOUT_3_PAUSE = 5000;
const AUTO_MODE_LOCATIONS_STORAGE_KEY = "map3-auto-mode-locations";

function isValidLocation(item: unknown): item is MapLocation {
  if (!item || typeof item !== "object") {
    return false;
  }

  const candidate = item as {
    name?: unknown;
    composition?: unknown;
    coords?: unknown;
  };

  return (
    typeof candidate.name === "string" &&
    typeof candidate.composition === "string" &&
    Array.isArray(candidate.coords) &&
    candidate.coords.length === 2 &&
    typeof candidate.coords[0] === "number" &&
    Number.isFinite(candidate.coords[0]) &&
    typeof candidate.coords[1] === "number" &&
    Number.isFinite(candidate.coords[1])
  );
}

export function useAutoMode(mapRef: React.RefObject<MapRef>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [autoActive, setAutoActive] = useState(false);
  const [autoLocationIndex, setAutoLocationIndex] = useState(0);
  const [autoLocations, setAutoLocations] = useState<MapLocation[]>(locations);

  const timeout1 = useRef<NodeJS.Timeout | null>(null);
  const timeout2 = useRef<NodeJS.Timeout | null>(null);
  const timeout3 = useRef<NodeJS.Timeout | null>(null);

  const onAutoActivateToggle = useCallback((state: boolean) => {
    console.log(`Setting automode: ${state}`);
    setAutoActive(state);
    if (!state) {
      if (timeout1.current) clearTimeout(timeout1.current);
      if (timeout2.current) clearTimeout(timeout2.current);
      if (timeout3.current) clearTimeout(timeout3.current);
    }
  }, []);

  const saveAutoLocations = useCallback((nextLocations: MapLocation[]) => {
    const sanitized = nextLocations.filter(isValidLocation);
    if (sanitized.length === 0) {
      return;
    }

    setAutoLocations(sanitized);
    setAutoLocationIndex((prev) =>
      Math.min(prev, Math.max(0, sanitized.length - 1)),
    );
    window.localStorage.setItem(
      AUTO_MODE_LOCATIONS_STORAGE_KEY,
      JSON.stringify(sanitized),
    );
  }, []);

  useEffect(() => {
    const serialized = window.localStorage.getItem(
      AUTO_MODE_LOCATIONS_STORAGE_KEY,
    );
    if (!serialized) {
      return;
    }

    try {
      const parsed = JSON.parse(serialized) as unknown;
      if (!Array.isArray(parsed)) {
        return;
      }
      const validLocations = parsed.filter(isValidLocation);
      if (validLocations.length > 0) {
        setAutoLocations(validLocations);
      }
    } catch {
      window.localStorage.removeItem(AUTO_MODE_LOCATIONS_STORAGE_KEY);
    }
  }, []);

  const onMoveEndAuto = useCallback(
    (_e: ViewStateChangeEvent) => {
      if (autoLocations.length === 0) {
        return;
      }

      const [lng, lat] = autoLocations[autoLocationIndex].coords;
      console.log("Auto move end, ", autoActive);
      timeout1.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("lat", lat.toString());
        params.set("lng", lng.toString());
        params.set("mode", "player");
        params.set("composition", autoLocations[autoLocationIndex].composition);
        router.replace(`${pathname}?${params.toString()}`);
        timeout2.current = setTimeout(() => {
          params.set("mode", "map");
          router.replace(`${pathname}?${params.toString()}`);
          timeout3.current = setTimeout(() => {
            setAutoLocationIndex((prev) => {
              const next = prev + 1;
              return next > autoLocations.length - 1 ? 0 : next;
            });
          }, TIMEOUT_3_PAUSE);
        }, TIMEOUT_2_PAUSE);
      }, TIMEOUT_1_PAUSE);
    },
    [
      autoLocationIndex,
      autoActive,
      autoLocations,
      pathname,
      searchParams,
      router,
    ],
  );

  useEffect(() => {
    if (autoActive && autoLocations.length > 0) {
      mapRef.current?.flyTo({
        center: autoLocations[autoLocationIndex].coords,
        speed: 0.7,
        zoom: 4,
        easing: (t) => t ** 2,
      });
    }
  }, [autoActive, autoLocationIndex, autoLocations, mapRef]);

  return {
    autoActive,
    autoLocations,
    onAutoActivateToggle,
    onMoveEndAuto,
    saveAutoLocations,
  };
}
