export const KART_VISUAL_SCALE = 0.64;
export const KART_CONTACT_LENGTH = 3.55;
export const KART_CONTACT_WIDTH = 2.75;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap01 = value => (value % 1 + 1) % 1;

export function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function angleDelta(a, b) {
  return wrapAngle(a - b);
}

export function smoothAngle(current, target, response, dt) {
  if (!Number.isFinite(current)) return wrapAngle(target);
  return wrapAngle(current + angleDelta(target, current) * (1 - Math.exp(-Math.max(0, response) * dt)));
}

export function ensureWorldHeading(racer, trackYaw) {
  if (!Number.isFinite(racer.worldYaw)) racer.worldYaw = wrapAngle(trackYaw + (racer.headingOffset || 0));
  racer.headingOffset = angleDelta(racer.worldYaw, trackYaw);
  return racer.worldYaw;
}

export function applyManualSteering(racer, trackYaw, steerInput, speedRatio, direction, dt, drifting = false) {
  ensureWorldHeading(racer, trackYaw);
  const authority = 0.22 + 0.78 * clamp(speedRatio, 0, 1);
  const maxYawRate = (drifting ? 1.42 : 1.12) * authority;
  const targetYawRate = clamp(steerInput, -1, 1) * (direction >= 0 ? 1 : -1) * maxYawRate;
  const response = drifting ? 5.2 : 7.2;
  racer.yawRate = (racer.yawRate || 0) + (targetYawRate - (racer.yawRate || 0)) * Math.min(1, response * dt);
  racer.worldYaw = wrapAngle(racer.worldYaw + racer.yawRate * dt);
  racer.headingOffset = angleDelta(racer.worldYaw, trackYaw);
  return racer.headingOffset;
}

export function trackRelativeVelocity(speed, headingOffset, lateralGrip = 1) {
  return {
    forward: speed * Math.cos(headingOffset),
    lateral: speed * Math.sin(headingOffset) * lateralGrip,
  };
}

export function modularProgressDelta(a, b) {
  let delta = a - b;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  return delta;
}

export function resolveKartPair(a, b, trackLength, options = {}) {
  if (!a || !b || !Number.isFinite(trackLength) || trackLength <= 0) return null;
  const length = options.length || KART_CONTACT_LENGTH;
  const width = options.width || KART_CONTACT_WIDTH;
  const along = modularProgressDelta(a.s, b.s) * trackLength;
  const side = a.lane - b.lane;
  const ex = along / length;
  const ey = side / width;
  const distance = Math.hypot(ex, ey);
  if (distance >= 1) return null;

  let ux, uy;
  if (distance < 1e-6) {
    ux = 0;
    uy = String(a.id) <= String(b.id) ? -1 : 1;
  } else {
    ux = ex / distance;
    uy = ey / distance;
  }

  // Resolve overlap in normalized ellipse space, then convert to track metres.
  const correction = 1 - distance + 0.006;
  const correctionAlong = ux * correction * length;
  const correctionSide = uy * correction * width;
  a.s = wrap01(a.s + correctionAlong * 0.5 / trackLength);
  b.s = wrap01(b.s - correctionAlong * 0.5 / trackLength);
  a.lane += correctionSide * 0.5;
  b.lane -= correctionSide * 0.5;

  // Physical contact normal is the normalized ellipse gradient.
  let nx = along / (length * length);
  let ny = side / (width * width);
  const normalLength = Math.hypot(nx, ny);
  if (normalLength < 1e-6) {
    nx = ux;
    ny = uy;
  } else {
    nx /= normalLength;
    ny /= normalLength;
  }

  const vaAlong = Number.isFinite(a.speed) ? a.speed : 0;
  const vbAlong = Number.isFinite(b.speed) ? b.speed : 0;
  const vaSide = Number.isFinite(a.laneVel) ? a.laneVel : 0;
  const vbSide = Number.isFinite(b.laneVel) ? b.laneVel : 0;
  const relativeAlong = vaAlong - vbAlong;
  const relativeSide = vaSide - vbSide;
  const closingSpeed = relativeAlong * nx + relativeSide * ny;
  let impact = 0;

  if (closingSpeed < -0.05) {
    const restitution = options.restitution ?? 0.18;
    const impulse = -(1 + restitution) * closingSpeed * 0.5;
    const tx = -ny;
    const ty = nx;
    const tangentSpeed = relativeAlong * tx + relativeSide * ty;
    const frictionLimit = impulse * (options.friction ?? 0.24);
    const tangentImpulse = clamp(-tangentSpeed * 0.5, -frictionLimit, frictionLimit);
    const impulseAlong = impulse * nx + tangentImpulse * tx;
    const impulseSide = impulse * ny + tangentImpulse * ty;

    a.speed = clamp(vaAlong + impulseAlong, -12, 78);
    b.speed = clamp(vbAlong - impulseAlong, -12, 78);
    a.bumpLane = clamp((a.bumpLane || 0) + impulseSide, -12, 12);
    b.bumpLane = clamp((b.bumpLane || 0) - impulseSide, -12, 12);
    a.laneVel = clamp(vaSide + impulseSide, -14, 14);
    b.laneVel = clamp(vbSide - impulseSide, -14, 14);

    const aSpeed = Math.max(10, Math.abs(a.speed));
    const bSpeed = Math.max(10, Math.abs(b.speed));
    const aTurn = clamp(impulseSide / aSpeed * 0.18, -0.14, 0.14);
    const bTurn = clamp(-impulseSide / bSpeed * 0.18, -0.14, 0.14);
    a.headingOffset = angleDelta((a.headingOffset || 0) + aTurn, 0);
    b.headingOffset = angleDelta((b.headingOffset || 0) + bTurn, 0);
    if (Number.isFinite(a.worldYaw)) a.worldYaw = wrapAngle(a.worldYaw + aTurn);
    if (Number.isFinite(b.worldYaw)) b.worldYaw = wrapAngle(b.worldYaw + bTurn);
    if (Number.isFinite(a.velocityYaw)) a.velocityYaw = wrapAngle(a.velocityYaw + aTurn * 0.55);
    if (Number.isFinite(b.velocityYaw)) b.velocityYaw = wrapAngle(b.velocityYaw + bTurn * 0.55);
    impact = -closingSpeed;
  }

  return {impact, penetration: 1 - distance, normalAlong: nx, normalSide: ny};
}

export function resolveTrackEdge(racer, roadWidth) {
  if (!racer || !Number.isFinite(roadWidth) || roadWidth <= 0) return null;
  const hardEdge = roadWidth * 0.64;
  const distance = Math.abs(racer.lane);
  if (distance <= hardEdge) return null;
  const side = Math.sign(racer.lane) || 1;
  const sideVelocity = Number.isFinite(racer.laneVel) ? racer.laneVel : 0;
  const outwardSpeed = Math.max(0, sideVelocity * side);
  const penetration = distance - hardEdge;

  racer.lane = side * hardEdge;
  racer.bumpLane = -side * Math.max(1.8, outwardSpeed * 0.42 + penetration * 2.5);
  racer.laneVel = racer.bumpLane;
  const turn = -side * Math.min(0.045, 0.012 + Math.abs(racer.speed || 0) * 0.0005);
  racer.headingOffset = angleDelta((racer.headingOffset || 0) + turn, 0);
  if (Number.isFinite(racer.worldYaw)) racer.worldYaw = wrapAngle(racer.worldYaw + turn);
  if (Number.isFinite(racer.velocityYaw)) racer.velocityYaw = wrapAngle(racer.velocityYaw + turn * 2.4);
  racer.speed = (racer.speed || 0) * clamp(0.96 - outwardSpeed * 0.004, 0.84, 0.96);
  return {impact: outwardSpeed + penetration * 8, penetration, side};
}
