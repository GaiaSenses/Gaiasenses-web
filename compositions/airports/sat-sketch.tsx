"use client";
import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
type SatSketch = {
  lat: string;
  lon: string;
};

export default function SatSketch({ lat, lon }: SatSketch) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [url, setUrl] = useState<null | string>(null);
  const ref = useRef<HTMLDivElement>(null);
  const ACCESS_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_API_ACCESS_TOKEN;

  useLayoutEffect(() => {
    if (ref.current) {
      const { width, height } = ref.current.getBoundingClientRect();
      const w = width > 1280 ? 1280 : 1280;
      const h = height > 1280 ? 1280 : 1280;
      //setSize({ width: w, height: h });
      setUrl(
        `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${lon},${lat},14,0/${w}x${h}@2x?access_token=${ACCESS_TOKEN}`,
      );
    }
  }, [lat, lon, ACCESS_TOKEN]);

  return (
    <div className="relative h-full flex justify-center bg-black" ref={ref}>
      {url && (
        <Image
          src={url}
          alt={""}
          // width={size.width}
          // height={size.height}
          fill
          className={"relative animate-my-rotate-hue"}
        ></Image>
      )}
    </div>
  );
}
