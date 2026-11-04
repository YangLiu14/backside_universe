// A single reversible timeline: no delayed side effects when the visitor scrubs.
export const JOURNEY_MS = 4500;
export const clamp01 = value => Math.max(0, Math.min(1, value));
export function smoothRange(value, start, end) {
  const t = clamp01((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}
export function smootherRange(value,start,end){
  const t=clamp01((value-start)/(end-start));
  return t*t*t*(t*(t*6-15)+10);
}
export function sampleJourney(value) {
  const progress = clamp01(value);
  const turn = smootherRange(progress, .39, 1);
  const earlyEase=end=>smootherRange(1-(1-clamp01(progress/end))**2,0,1);
  return {
    progress,
    approach: smootherRange(progress, .39, .85),
    aim: earlyEase(.46),
    framing: earlyEase(.54),
    turn,
    seam: smootherRange(progress, .23, .39),
    holiday: smootherRange(turn, .10, .58),
    title: smoothRange(progress, .86, 1),
  };
}

/** Physical orbit around fixed desktop objects. Kept separate from rendering
 * so a camera that merely zooms the original photograph cannot pass the test. */
export function orbitPose(state, origin, center, portrait=false) {
  const dx=origin[0]-center[0],dy=origin[1]-center[1],dz=origin[2]-center[2];
  const initialRadius=Math.hypot(dx,dy,dz),initialElevation=Math.asin(dy/initialRadius);
  const azimuth=Math.atan2(dx,dz)+Math.PI*state.turn;
  const radius=initialRadius+(portrait?3.7-initialRadius:2.65-initialRadius)*state.approach;
  const elevation=initialElevation+(.36-initialElevation)*state.approach+.18*Math.sin(state.turn*Math.PI)**2;
  return {
    position:[center[0]+Math.sin(azimuth)*Math.cos(elevation)*radius,center[1]+Math.sin(elevation)*radius,center[2]+Math.cos(azimuth)*Math.cos(elevation)*radius],
    angle:state.turn*Math.PI,radius,elevation,
  };
}

// Framing is one continuous curve in world units. FOV follows distance instead
// of independently zooming out while the camera dollies in.
export function framingFov(state,homeFov,initialRadius,radius,portrait=false){
  const initialHalfHeight=initialRadius*Math.tan(homeFov*Math.PI/360);
  const finalHalfHeight=(portrait?3.7:2.65)*Math.tan((portrait?72:47)*Math.PI/360);
  const halfHeight=Math.exp(Math.log(initialHalfHeight)+(Math.log(finalHalfHeight)-Math.log(initialHalfHeight))*state.framing);
  return Math.atan(halfHeight/radius)*360/Math.PI;
}

// The spatial reveal moves from the computer's coast toward the book/cup.
// Mirrors the compositor's smoothstep, keeping endpoint/reverse tests pure.
export function discoveryWeight(amount,worldX){
  const delay=clamp01((worldX+.3)/2.1)*.78;
  return smoothRange(amount,delay,delay+.22);
}
