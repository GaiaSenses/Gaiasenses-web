/**
 * Which Mapbox interaction handlers stay on, depending on whether the Gaiaball
 * is connected.
 *
 * With the ball connected it owns the globe: the position (mirror or joystick)
 * is computed on the ball and applied with jumpTo. A mouse or touch drag would
 * only be undone by the ball's next movement — and it hid the weather popup
 * until the ball moved again — so everything that moves the centre or the
 * bearing is switched off: drag pan, drag rotate, the arrow keys, double-click
 * zoom (it recentres on the clicked point), pinch (it rotates and shifts the
 * centre) and touch pitch. Wheel zoom stays, anchored at the centre, because it
 * never moves the point the ball chose.
 *
 * The two objects are frozen and reused so the map only re-applies its handlers
 * when the connection state actually changes.
 */
export type MapInteractionProps = Readonly<{
  dragPan: boolean;
  dragRotate: boolean;
  keyboard: boolean;
  doubleClickZoom: boolean;
  touchPitch: boolean;
  touchZoomRotate: boolean;
  scrollZoom: boolean | Readonly<{ around: "center" }>;
}>;

const FREE: MapInteractionProps = Object.freeze({
  dragPan: true,
  dragRotate: true,
  keyboard: true,
  doubleClickZoom: true,
  touchPitch: true,
  touchZoomRotate: true,
  scrollZoom: true,
});

const BALL_CONNECTED: MapInteractionProps = Object.freeze({
  dragPan: false,
  dragRotate: false,
  keyboard: false,
  doubleClickZoom: false,
  touchPitch: false,
  touchZoomRotate: false,
  scrollZoom: Object.freeze({ around: "center" as const }),
});

export function mapInteractionProps(
  ballConnected: boolean,
): MapInteractionProps {
  return ballConnected ? BALL_CONNECTED : FREE;
}
