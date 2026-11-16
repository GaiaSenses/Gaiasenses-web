/**
 * Microphone for patches that listen to it with `[adc~]`.
 *
 * Pd4Web opens the microphone on its own, inside `JS_GetMicAccess`, when a
 * patch is opened with `channelCountIn > 0`. That code has two problems for a
 * public site:
 *
 *  - it chains a bare `.then()` on `getUserMedia`, so a refusal (or a machine
 *    with no microphone) becomes an uncaught `NotAllowedError`;
 *  - it only connects the patch to the speakers *inside* that `.then()`, so
 *    after a refusal the whole patch is silent, not just its microphone input.
 *
 * So the site asks first, with the same constraints Pd4Web uses, and only opens
 * the patch with an input channel once the visitor has said yes. The stream it
 * got is then lent to Pd4Web: its own `getUserMedia({audio})` call receives
 * that stream instead of opening a second capture (which some browsers would
 * answer with a second prompt). Because the site owns the stream, it can stop
 * the tracks when the patch closes, which turns the browser's microphone
 * indicator off; Pd4Web never stops them.
 *
 * Pure module (no React, no pd4web): importable from node:test.
 */

/** The constraints `JS_GetMicAccess` passes, so the lent stream is the same thing it would get. */
export const PD4WEB_MIC_CONSTRAINTS: MediaStreamConstraints = {
  video: false,
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  },
};

/** The part of `navigator.mediaDevices` this module touches. */
export type MediaDevicesLike = {
  getUserMedia(constraints?: MediaStreamConstraints): Promise<MediaStream>;
};

/**
 * Ask for the microphone. Resolves to the stream, or to `null` when the visitor
 * refuses, there is no microphone, or the page is not a secure context (where
 * `navigator.mediaDevices` does not exist). Never rejects.
 */
export async function requestPatchMicrophone(
  devices: MediaDevicesLike | undefined,
): Promise<MediaStream | null> {
  if (!devices || typeof devices.getUserMedia !== "function") {
    return null;
  }
  try {
    return await devices.getUserMedia(PD4WEB_MIC_CONSTRAINTS);
  } catch (error) {
    console.info(
      "pd4web: microfone indisponível; o patch toca sem a entrada [adc~].",
      error,
    );
    return null;
  }
}

/**
 * Make the next `getUserMedia` call that asks for audio resolve to `stream`,
 * then step aside. Returns a function that undoes the substitution if it was
 * never used (safe to call more than once).
 *
 * The substitute is an own property on the `devices` object, shadowing the
 * prototype's method; undoing it deletes that property (or puts back an own
 * method that was already there), so nothing is left behind.
 */
export function lendMicStream(
  devices: MediaDevicesLike,
  stream: MediaStream,
): () => void {
  const hadOwnMethod = Object.prototype.hasOwnProperty.call(
    devices,
    "getUserMedia",
  );
  const previous = devices.getUserMedia;
  let lent = true;

  const restore = () => {
    if (!lent) return;
    lent = false;
    if (hadOwnMethod) {
      devices.getUserMedia = previous;
    } else {
      Reflect.deleteProperty(devices, "getUserMedia");
    }
  };

  devices.getUserMedia = (constraints?: MediaStreamConstraints) => {
    if (constraints?.audio) {
      restore();
      return Promise.resolve(stream);
    }
    return previous.call(devices, constraints);
  };

  return restore;
}

/** Stop every track of the stream, which releases the microphone. */
export function stopMicStream(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
