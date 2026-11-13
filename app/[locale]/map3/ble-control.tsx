"use client";
import { Gamepad, Loader2 } from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  decodeCo2Notification,
  decodeNavNotification,
  decodeSensorNotification,
  resetCo2StaleWarning,
  type espCo2Response,
  type espResponse,
  type GaiaballNav,
} from "./ble-decode";

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 1500;
/**
 * The info card is for a human to read: ~5 Hz is plenty. Packets arrive at up
 * to 50 Hz per characteristic, and a state update per packet re-rendered this
 * component (and the card) on every one of them.
 */
const INFO_CARD_REFRESH_MS = 200;

interface BLEDevice {
  device: BluetoothDevice | null;
  server: BluetoothRemoteGATTServer | null;
  characteristic: BluetoothRemoteGATTCharacteristic | null;
  co2Characteristic: BluetoothRemoteGATTCharacteristic | null;
  navCharacteristic: BluetoothRemoteGATTCharacteristic | null;
}

const EMPTY_DEVICE: BLEDevice = {
  device: null,
  server: null,
  characteristic: null,
  co2Characteristic: null,
  navCharacteristic: null,
};

type InfoCardData = {
  imu: espResponse | null;
  co2: espCo2Response | null;
  nav: GaiaballNav | null;
};

const EMPTY_INFO: InfoCardData = { imu: null, co2: null, nav: null };

export type { espResponse, espCo2Response, GaiaballNav };

// Copy exactly the notification bytes (the DataView may sit on a larger buffer)
function toArrayBuffer(view: DataView): ArrayBuffer {
  const bytes = new Uint8Array(view.byteLength);
  bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return bytes.buffer;
}

const bleService = "19b10000-e8f2-537e-4f6c-d104768a1214";
const sensorCharacteristic = "19b10001-e8f2-537e-4f6c-d104768a1214";
const co2CharacteristicIUD = "19b10003-e8f2-537e-4f6c-d104768a1214";
/** Optional: firmware older than the on-ball navigation does not have it. */
const navCharacteristicUUID = "19b10006-e8f2-537e-4f6c-d104768a1214";

type BLEControlProps = {
  onSensor: (data: espResponse) => void;
  onCo2Sensor: (data: espCo2Response) => void;
  onNav: (data: GaiaballNav) => void;
  onConnect: (mode: string) => void;
  onDisconnect: (mode: string) => void;
  /** The link dropped on its own (not a click); reconnection is attempted. */
  onConnectionLost?: () => void;
  containerClassName?: string;
  buttonClassName?: string;
  errorClassName?: string;
  infoCardClassName?: string;
  showButtonLabel?: boolean;
};

export default function BLEControl({
  onSensor,
  onCo2Sensor,
  onNav,
  onConnect,
  onDisconnect,
  onConnectionLost,
  containerClassName,
  buttonClassName,
  errorClassName,
  infoCardClassName,
  showButtonLabel = false,
}: BLEControlProps) {
  const [bleDevice, setBleDevice] = useState<BLEDevice>(EMPTY_DEVICE);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null = not known yet (not connected); false = the firmware lacks it.
  const [hasNav, setHasNav] = useState<boolean | null>(null);
  const [info, setInfo] = useState<InfoCardData>(EMPTY_INFO);

  // Kept in a ref so the gattserverdisconnected closure can always access the latest device
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalDisconnectRef = useRef(false);
  const onSensorRef = useRef(onSensor);
  const onCo2SensorRef = useRef(onCo2Sensor);
  const onNavRef = useRef(onNav);
  const onConnectionLostRef = useRef(onConnectionLost);

  // Latest decoded packets for the info card, copied to state at most every
  // INFO_CARD_REFRESH_MS (only when something new arrived).
  const latestInfoRef = useRef<InfoCardData>({ ...EMPTY_INFO });
  const infoDirtyRef = useRef(false);

  useEffect(() => {
    onSensorRef.current = onSensor;
  }, [onSensor]);

  useEffect(() => {
    onCo2SensorRef.current = onCo2Sensor;
  }, [onCo2Sensor]);

  useEffect(() => {
    onNavRef.current = onNav;
  }, [onNav]);

  useEffect(() => {
    onConnectionLostRef.current = onConnectionLost;
  }, [onConnectionLost]);

  useEffect(() => {
    if (!isConnected) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (!infoDirtyRef.current) {
        return;
      }
      infoDirtyRef.current = false;
      setInfo({ ...latestInfoRef.current });
    }, INFO_CARD_REFRESH_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isConnected]);

  const handleCharacteristicValueChanged = useCallback((event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    if (!value) return;
    // null = not a valid IMU packet → skip (the decoder never throws)
    const parsedData = decodeSensorNotification(toArrayBuffer(value));
    if (!parsedData) return;
    onSensorRef.current(parsedData);
    latestInfoRef.current.imu = parsedData;
    infoDirtyRef.current = true;
  }, []);

  const handleCo2CharacteristicValueChanged = useCallback((event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    if (!value) return;
    const parsedData = decodeCo2Notification(toArrayBuffer(value));
    if (!parsedData) return;
    onCo2SensorRef.current(parsedData);
    latestInfoRef.current.co2 = parsedData;
    infoDirtyRef.current = true;
  }, []);

  const handleNavCharacteristicValueChanged = useCallback((event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    if (!value) return;
    const parsedData = decodeNavNotification(toArrayBuffer(value));
    if (!parsedData) return;
    onNavRef.current(parsedData);
    latestInfoRef.current.nav = parsedData;
    infoDirtyRef.current = true;
  }, []);

  const setupGATT = useCallback(
    async (device: BluetoothDevice) => {
      if (!device.gatt) throw new Error("GATT server not found on device");

      const server = await device.gatt.connect();
      resetCo2StaleWarning();
      const service = await server.getPrimaryService(bleService);

      const characteristic =
        await service.getCharacteristic(sensorCharacteristic);
      const co2Characteristic =
        await service.getCharacteristic(co2CharacteristicIUD);

      // The navigation characteristic is optional: a ball with older firmware
      // still connects (IMU and CO2 work), it just cannot steer the globe.
      let navCharacteristic: BluetoothRemoteGATTCharacteristic | null = null;
      try {
        navCharacteristic = await service.getCharacteristic(
          navCharacteristicUUID,
        );
      } catch {
        navCharacteristic = null;
      }

      if (characteristic.properties.notify) {
        await characteristic.startNotifications();
        characteristic.addEventListener(
          "characteristicvaluechanged",
          handleCharacteristicValueChanged,
        );
      }

      if (co2Characteristic.properties.notify) {
        await co2Characteristic.startNotifications();
        co2Characteristic.addEventListener(
          "characteristicvaluechanged",
          handleCo2CharacteristicValueChanged,
        );
      }

      if (navCharacteristic?.properties.notify) {
        try {
          await navCharacteristic.startNotifications();
          navCharacteristic.addEventListener(
            "characteristicvaluechanged",
            handleNavCharacteristicValueChanged,
          );
        } catch (err) {
          console.warn("Gaiaball: navigation notifications failed", err);
          navCharacteristic = null;
        }
      } else {
        navCharacteristic = null;
      }

      latestInfoRef.current = { ...EMPTY_INFO };
      infoDirtyRef.current = false;
      setInfo(EMPTY_INFO);
      setHasNav(navCharacteristic !== null);
      setBleDevice({
        device,
        server,
        characteristic,
        co2Characteristic,
        navCharacteristic,
      });
      setIsConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;
      onConnect("controller");

      return { server, characteristic, co2Characteristic, navCharacteristic };
    },
    [
      handleCharacteristicValueChanged,
      handleCo2CharacteristicValueChanged,
      handleNavCharacteristicValueChanged,
      onConnect,
    ],
  );

  const attemptReconnect = useCallback(
    async (device: BluetoothDevice) => {
      if (intentionalDisconnectRef.current) return;
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setError("Could not reconnect to device. Please pair again.");
        setIsConnected(false);
        return;
      }

      reconnectAttemptsRef.current += 1;
      setError(
        `Connection lost — reconnecting (${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})…`,
      );

      await new Promise((r) => setTimeout(r, RECONNECT_DELAY_MS));

      try {
        await setupGATT(device);
        setError(null);
      } catch {
        attemptReconnect(device);
      }
    },
    [setupGATT],
  );

  const connectBLE = async () => {
    if (isConnecting || isConnected) return;
    setIsConnecting(true);
    setError(null);

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [bleService] }],
      });

      intentionalDisconnectRef.current = false;
      deviceRef.current = device;

      device.addEventListener("gattserverdisconnected", () => {
        setIsConnected(false);
        setBleDevice((prev) => ({
          ...prev,
          server: null,
          characteristic: null,
          co2Characteristic: null,
          navCharacteristic: null,
        }));
        if (!intentionalDisconnectRef.current && deviceRef.current) {
          onConnectionLostRef.current?.();
          attemptReconnect(deviceRef.current);
        }
      });

      await setupGATT(device);
    } catch (err) {
      if (err instanceof Error && err.name === "NotFoundError") {
        // User cancelled the browser picker — not an error
        setError(null);
      } else {
        console.error("Bluetooth Error:", err);
        setError(err instanceof Error ? err.message : "Failed to connect");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectBLE = () => {
    intentionalDisconnectRef.current = true;
    reconnectAttemptsRef.current = 0;

    const subscriptions: [
      BluetoothRemoteGATTCharacteristic | null,
      (event: Event) => void,
    ][] = [
      [bleDevice.characteristic, handleCharacteristicValueChanged],
      [bleDevice.co2Characteristic, handleCo2CharacteristicValueChanged],
      [bleDevice.navCharacteristic, handleNavCharacteristicValueChanged],
    ];
    for (const [characteristic, handler] of subscriptions) {
      if (!characteristic) continue;
      characteristic.removeEventListener("characteristicvaluechanged", handler);
      if (characteristic.properties.notify) {
        characteristic.stopNotifications().catch(() => {});
      }
    }

    if (bleDevice.device?.gatt?.connected) {
      bleDevice.device.gatt.disconnect();
    }

    deviceRef.current = null;
    setBleDevice(EMPTY_DEVICE);
    setIsConnected(false);
    latestInfoRef.current = { ...EMPTY_INFO };
    infoDirtyRef.current = false;
    setInfo(EMPTY_INFO);
    setHasNav(null);
    setError(null);
    onDisconnect("mouse");
  };

  const buttonTitle = isConnecting
    ? "Connecting…"
    : isConnected
      ? "Disconnect"
      : "Connect device";

  const nav = info.nav;
  let navLabel: string;
  if (!nav) {
    navLabel = "aguardando";
  } else if (!nav.valid) {
    navLabel = "desligada";
  } else {
    navLabel = nav.settled ? "parada" : "em movimento";
  }

  return (
    <>
      <div
        className={`absolute top-[295px] right-0 z-90 ${containerClassName ?? ""}`}
      >
        <div className="mr-[10px] mt-[10px] flex justify-end">
          <button
            onClick={isConnected ? disconnectBLE : connectBLE}
            disabled={isConnecting}
            className={`flex items-center justify-center rounded-sm bg-white hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 ${
              showButtonLabel
                ? "h-12 min-w-[220px] gap-3 px-5 text-sm font-semibold shadow-lg"
                : "h-[29px] w-[29px]"
            } ${buttonClassName ?? ""}`}
            title={buttonTitle}
          >
            {isConnecting ? (
              <Loader2
                width={18}
                height={18}
                className={`animate-spin ${showButtonLabel ? "text-current" : "text-gray-500"}`}
              />
            ) : (
              <Gamepad
                width={showButtonLabel ? 20 : 22}
                height={showButtonLabel ? 20 : 22}
                strokeWidth={2.5}
                className={
                  showButtonLabel
                    ? "text-current"
                    : isConnected
                      ? "text-green-600"
                      : "text-gray-700"
                }
              />
            )}
            {showButtonLabel ? (
              <span>
                {isConnecting
                  ? "Connecting sensor…"
                  : isConnected
                    ? "Disconnect BLE sensor"
                    : "Connect BLE sensor"}
              </span>
            ) : null}
          </button>
        </div>

        {error && (
          <div
            className={`mr-[10px] mt-1 max-w-[160px] rounded bg-white p-2 text-xs text-red-500 shadow-md ${errorClassName ?? ""}`}
          >
            {error}
          </div>
        )}
      </div>

      {isConnected &&
        bleDevice.device &&
        createPortal(
          <div
            className={`absolute bottom-16 right-0 z-10 mt-12 mr-[10px] min-h-52 w-48 space-y-2 rounded bg-white p-2 text-sm shadow-md ${infoCardClassName ?? ""}`}
          >
            <p className="font-medium">
              {bleDevice?.device?.name ?? "Unknown Device"}
            </p>
            <p>roll: {info.imu?.euler.roll.toFixed(3)}</p>
            <p>pitch: {info.imu?.euler.pitch.toFixed(3)}</p>
            <p>yaw: {info.imu?.euler.yaw.toFixed(3)}</p>
            <p>CO₂: {info.co2?.co2.ppm.toFixed(0)} ppm</p>
            {hasNav === false ? (
              <p className="text-xs font-medium text-amber-700">
                Firmware da bola sem navegação — atualize o firmware
              </p>
            ) : (
              <>
                <p>navegação: {navLabel}</p>
                {nav?.valid ? (
                  <p className="text-xs text-gray-600">
                    {nav.lat.toFixed(3)}, {nav.lon.toFixed(3)} · rumo{" "}
                    {nav.bearing.toFixed(0)}°
                  </p>
                ) : null}
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
