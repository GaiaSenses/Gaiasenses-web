"use client";
import { SlidersHorizontal } from "lucide-react";
import { useSyncExternalStore } from "react";
import { gaiaball } from "@/lib/gaiaball-live";

/** The Gaiaball config app (its own repo, deployed on GitHub Pages). */
const GAIABALL_CONFIG_URL = "https://gaiasenses.github.io/gaiaball/";

const isBallLinked = () => gaiaball.get().connected;
const notLinkedOnServer = () => false;

/**
 * Opens the Gaiaball config app in a new tab. It sits right below the BLE
 * button (top-[295px]) in the column of 40px-spaced map buttons.
 *
 * Shown only while a ball is linked, as the live store says: `connected`
 * drops the moment the link is lost and comes back on a successful
 * reconnect. Not the map's isBallConnected, which stays true through the
 * reconnect attempts.
 *
 * Both tabs can be connected to the ball at the same time: the browser shares
 * one Bluetooth link between them and each tab gets its own notifications.
 * This page still has to connect on its own (the permission is per origin).
 */
export default function GaiaballConfigButton() {
  const linked = useSyncExternalStore(
    gaiaball.subscribe,
    isBallLinked,
    notLinkedOnServer,
  );
  if (!linked) return null;

  return (
    <div className="absolute top-[335px] right-0 z-10">
      <div className="mr-[10px] mt-[10px]">
        <a
          href={GAIABALL_CONFIG_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Configure Gaiaball (opens in a new tab)"
          aria-label="Configure Gaiaball (opens in a new tab)"
          className="bg-white w-[29px] h-[29px] rounded-sm flex justify-center items-center hover:bg-gray-200"
        >
          <SlidersHorizontal width={22} height={22} strokeWidth={2.5} />
        </a>
      </div>
    </div>
  );
}
