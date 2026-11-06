"use client";
import { Gamepad, Loader2 } from "lucide-react";
import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  decodeCo2Notification,
  decodeSensorNotification,
  resetCo2StaleWarning,
  type espCo2Response,
  type espResponse,
} from "./ble-decode";

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 1500;

interface BLEDevice {
  device: BluetoothDevice | null;
  server: BluetoothRemoteGATTServer | null;
  characteristic: BluetoothRemoteGATTCharacteristic | null;
  co2Characteristic: BluetoothRemoteGATTCharacteristic | null;
}

export type { espResponse, espCo2Response };

// Copy exactly the notification bytes (the DataView may sit on a larger buffer)
function toArrayBuffer(view: DataView): ArrayBuffer {
  const bytes = new Uint8Array(view.byteLength);
  bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return bytes.buffer;
}

const deviceName = "Bolota Senses";
const bleService = "19b10000-e8f2-537e-4f6c-d104768a1214";
const ledCharacteristic = "19b10002-e8f2-537e-4f6c-d104768a1214";
const sensorCharacteristic = "19b10001-e8f2-537e-4f6c-d104768a1214";
const co2CharacteristicIUD = "19b10003-e8f2-537e-4f6c-d104768a1214";

type BLEControlProps = {
  onSensor: (data: espResponse) => void;
  onCo2Sensor: (data: espCo2Response) => void;
  onConnect: (mode: string) => void;
  onDisconnect: (mode: string) => void;
  containerClassName?: string;
  buttonClassName?: string;
  errorClassName?: string;
  infoCardClassName?: string;
  showButtonLabel?: boolean;
};

export default function BLEControl({
  onSensor,
  onCo2Sensor,
  onConnect,
  onDisconnect,
  containerClassName,
  buttonClassName,
  errorClassName,
  infoCardClassName,
  showButtonLabel = false,
}: BLEControlProps) {
  const [bleDevice, setBleDevice] = useState<BLEDevice>({
    device: null,
    server: null,
    characteristic: null,
    co2Characteristic: null,
  });
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receivedData, setReceivedData] = useState<espResponse | null>(null);
  const [co2value, setCo2Value] = useState<number | null>(null);

  // Kept in a ref so the gattserverdisconnected closure can always access the latest device
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalDisconnectRef = useRef(false);
  const onSensorRef = useRef(onSensor);
  const onCo2SensorRef = useRef(onCo2Sensor);

  useEffect(() => {
    onSensorRef.current = onSensor;
  }, [onSensor]);

  useEffect(() => {
    onCo2SensorRef.current = onCo2Sensor;
  }, [onCo2Sensor]);

  const handleCharacteristicValueChanged = useCallback((event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    if (value) {
      // Binary v2 packet or legacy JSON; null = malformed/invalid → skip
      let parsedData: espResponse | null = null;
      try {
        parsedData = decodeSensorNotification(toArrayBuffer(value));
      } catch {
        return;
      }
      if (!parsedData) return;
      onSensorRef.current(parsedData);
      setReceivedData(parsedData);
    }
  }, []);

  const handleCo2CharacteristicValueChanged = useCallback((event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    const value = characteristic.value;
    if (value) {
      // Binary v2 packet or legacy JSON; null = malformed/invalid → skip
      let parsedData: espCo2Response | null = null;
      try {
        parsedData = decodeCo2Notification(toArrayBuffer(value));
      } catch {
        return;
      }
      if (!parsedData) return;
      onCo2SensorRef.current(parsedData);
      setCo2Value(parsedData.co2.ppm);
    }
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

      setBleDevice({ device, server, characteristic, co2Characteristic });
      setIsConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;
      onConnect("controller");

      return { server, characteristic, co2Characteristic };
    },
    [
      handleCharacteristicValueChanged,
      handleCo2CharacteristicValueChanged,
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
        }));
        if (!intentionalDisconnectRef.current && deviceRef.current) {
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

    if (bleDevice.characteristic) {
      bleDevice.characteristic.removeEventListener(
        "characteristicvaluechanged",
        handleCharacteristicValueChanged,
      );
      if (bleDevice.characteristic.properties.notify) {
        bleDevice.characteristic.stopNotifications().catch(() => {});
      }
    }

    if (bleDevice.co2Characteristic) {
      bleDevice.co2Characteristic.removeEventListener(
        "characteristicvaluechanged",
        handleCo2CharacteristicValueChanged,
      );
      if (bleDevice.co2Characteristic.properties.notify) {
        bleDevice.co2Characteristic.stopNotifications().catch(() => {});
      }
    }

    if (bleDevice.device?.gatt?.connected) {
      bleDevice.device.gatt.disconnect();
    }

    deviceRef.current = null;
    setBleDevice({
      device: null,
      server: null,
      characteristic: null,
      co2Characteristic: null,
    });
    setIsConnected(false);
    setReceivedData(null);
    setError(null);
    onDisconnect("mouse");
  };

  // Function to manually read the characteristic value
  const readValue = useCallback(async () => {
    if (!bleDevice.characteristic) {
      setError("No characteristic available");
      return;
    }

    try {
      const value = await bleDevice.characteristic.readValue();
      const decoder = new TextDecoder("utf-8");
      const decodedData = decoder.decode(value);
      const parsedData = JSON.parse(decodedData);
      onSensorRef.current(parsedData);
      setReceivedData(parsedData);
    } catch (err) {
      console.error("Read Error:", err);
      setError(err instanceof Error ? err.message : "Failed to read value");
    }
  }, [bleDevice.characteristic]);

  const buttonTitle = isConnecting
    ? "Connecting…"
    : isConnected
      ? "Disconnect"
      : "Connect device";

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
            <p>roll: {receivedData?.euler.roll?.toFixed(3)}</p>
            <p>pitch: {receivedData?.euler.pitch?.toFixed(3)}</p>
            <p>yaw: {receivedData?.euler.yaw?.toFixed(3)}</p>
            <p>CO₂: {co2value?.toFixed(3)} ppm</p>
          </div>,
          document.body,
        )}
    </>
  );
}
