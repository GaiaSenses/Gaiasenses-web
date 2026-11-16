import test from "node:test";
import assert from "node:assert/strict";
import {
  PD4WEB_MIC_CONSTRAINTS,
  lendMicStream,
  requestPatchMicrophone,
  stopMicStream,
} from "../app/[locale]/map3/pd4web-mic";

type FakeTrack = { stopped: boolean; stop(): void };

function fakeStream(tracks = 1) {
  const list: FakeTrack[] = Array.from({ length: tracks }, () => {
    const track: FakeTrack = {
      stopped: false,
      stop() {
        track.stopped = true;
      },
    };
    return track;
  });
  return {
    stream: { getTracks: () => list } as unknown as MediaStream,
    tracks: list,
  };
}

// The real MediaDevices keeps getUserMedia on its prototype; so does this fake.
class FakeDevices {
  calls: (MediaStreamConstraints | undefined)[] = [];
  // A plain field, not a constructor parameter property: node's type
  // stripping only handles erasable TypeScript syntax.
  readonly answer: () => Promise<MediaStream>;
  constructor(answer: () => Promise<MediaStream>) {
    this.answer = answer;
  }
  getUserMedia(constraints?: MediaStreamConstraints): Promise<MediaStream> {
    this.calls.push(constraints);
    return this.answer();
  }
}

test("asks once, with the constraints pd4web itself uses", async () => {
  const { stream } = fakeStream();
  const devices = new FakeDevices(() => Promise.resolve(stream));
  assert.equal(await requestPatchMicrophone(devices), stream);
  assert.deepEqual(devices.calls, [PD4WEB_MIC_CONSTRAINTS]);
});

test("a refusal resolves to null instead of rejecting", async () => {
  const devices = new FakeDevices(() =>
    Promise.reject(Object.assign(new Error("denied"), { name: "NotAllowedError" })),
  );
  const info = console.info;
  console.info = () => undefined;
  try {
    assert.equal(await requestPatchMicrophone(devices), null);
  } finally {
    console.info = info;
  }
});

test("no mediaDevices (insecure context) resolves to null", async () => {
  assert.equal(await requestPatchMicrophone(undefined), null);
});

test("the lent stream answers pd4web's audio request, then the real method is back", async () => {
  const { stream } = fakeStream();
  const other = fakeStream().stream;
  const devices = new FakeDevices(() => Promise.resolve(other));
  lendMicStream(devices, stream);

  assert.ok(Object.prototype.hasOwnProperty.call(devices, "getUserMedia"));
  assert.equal(await devices.getUserMedia(PD4WEB_MIC_CONSTRAINTS), stream);
  assert.equal(devices.calls.length, 0, "the lent call must not reach the browser");

  assert.ok(!Object.prototype.hasOwnProperty.call(devices, "getUserMedia"));
  assert.equal(await devices.getUserMedia({ audio: true }), other);
  assert.equal(devices.calls.length, 1);
});

test("a video-only request passes through untouched while the stream is lent", async () => {
  const { stream } = fakeStream();
  const other = fakeStream().stream;
  const devices = new FakeDevices(() => Promise.resolve(other));
  const restore = lendMicStream(devices, stream);

  assert.equal(await devices.getUserMedia({ video: true }), other);
  assert.ok(Object.prototype.hasOwnProperty.call(devices, "getUserMedia"));
  restore();
  restore();
  assert.ok(!Object.prototype.hasOwnProperty.call(devices, "getUserMedia"));
});

test("restore puts back an own method that was already there", async () => {
  const { stream } = fakeStream();
  const original = async () => fakeStream().stream;
  const devices = { getUserMedia: original };
  const restore = lendMicStream(devices, stream);
  assert.notEqual(devices.getUserMedia, original);
  restore();
  assert.equal(devices.getUserMedia, original);
});

test("stopping the stream stops every track", () => {
  const { stream, tracks } = fakeStream(2);
  stopMicStream(stream);
  assert.deepEqual(
    tracks.map((track) => track.stopped),
    [true, true],
  );
  stopMicStream(null);
});
