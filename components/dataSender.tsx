"use client";
import { useEffect, useRef } from "react";
import { insertSatelliteData } from "./supabase";

type DataSenderProps = {
  isOpen: boolean;
  composition: string;
  temp: number;
  speed: number;
  humidity: number;
  /** `null` quando a fonte não respondeu — gravar 0 inventaria um céu calmo. */
  lightningcount: number | null;
  firecount: number | null;
  date_timeplayed: string;
  pinnedlocation: { lat: number; lng: number };
  userLocation: { lat: number; lng: number };
};

export default function DataSender({
  isOpen,
  composition,
  temp,
  speed,
  humidity,
  lightningcount,
  firecount,
  date_timeplayed,
  pinnedlocation,
  userLocation,
}: DataSenderProps) {
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      startTimeRef.current = performance.now();
    } else if (startTimeRef.current !== null) {
      const timeSpent = Math.round((performance.now() - startTimeRef.current) / 1000); //segundos
      insertSatelliteData({
        name: composition,
        temperature: temp,
        wind_speed: speed,
        humidity,
        lightning_count: lightningcount,
        fire_count: firecount,
        date_timeplayed,
        pinnedlocation,
        userlocation: { userlat: userLocation.lat, userlng: userLocation.lng },
        timeSpent,
      });
      startTimeRef.current = null;
    }
  }, [isOpen,
      composition,
      temp,
      speed,
      humidity,
      lightningcount,
      firecount,
      date_timeplayed,
      pinnedlocation,
      userLocation.lat,
      userLocation.lng,]);
  return null;
}