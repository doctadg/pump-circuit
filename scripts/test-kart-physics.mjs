import assert from 'node:assert/strict';
import {KART_VISUAL_SCALE,KART_CONTACT_LENGTH,KART_CONTACT_WIDTH,angleDelta,applyManualSteering,ensureWorldHeading,resolveKartPair,resolveTrackEdge,smoothAngle,trackRelativeVelocity} from '../kart-physics.js';

const racer=(id,overrides={})=>({id,s:.3,lane:0,speed:0,laneVel:0,bumpLane:0,headingOffset:0,...overrides});
const trackLength=1000;

assert.equal(KART_VISUAL_SCALE,.64,'kart visual scale stays deliberately compact');

{
  const kart=racer(0,{worldYaw:0,yawRate:0});
  ensureWorldHeading(kart,0);
  applyManualSteering(kart,.55,0,1,1,.2,false);
  assert.equal(kart.worldYaw,0,'zero steering preserves world heading instead of following the spline');
  assert.ok(Math.abs(angleDelta(kart.headingOffset,-.55))<1e-9,'a bending track creates heading error when the user does not steer');
  const sideways=trackRelativeVelocity(40,Math.PI/2,.86);
  assert.ok(Math.abs(sideways.forward)<1e-8,'a sideways kart gets no automatic forward progress');
  assert.ok(sideways.lateral>34,'a sideways kart moves toward the track edge');
}

{
  const kart=racer(0,{worldYaw:0,yawRate:0});
  let previous=kart.worldYaw;
  for(let i=0;i<12;i++){
    applyManualSteering(kart,0,1,1,1,1/60,false);
    assert.ok(kart.worldYaw>=previous,'held steering turns monotonically');
    assert.ok(kart.worldYaw-previous<.04,'yaw response is smoothed rather than snapping');
    previous=kart.worldYaw;
  }
  assert.ok(kart.worldYaw>.09,'held steering develops meaningful authority');
}

{
  let travel=0;
  for(let i=0;i<30;i++)travel=smoothAngle(travel,.7,5.8,1/60);
  assert.ok(travel>.6&&travel<.7,'tire grip converges travel direction toward chassis heading');
  assert.ok(smoothAngle(3.13,-3.13,8,1/60)>3.1,'angle smoothing crosses the wrap boundary without a full-spin glitch');
}

{
  const rear=racer(0,{s:.3,speed:35});
  const front=racer(1,{s:.303,speed:10});
  const hit=resolveKartPair(rear,front,trackLength);
  assert(hit&&hit.impact>20,'rear-end contact has a meaningful closing-speed impulse');
  assert(rear.speed<35,'rear kart gives up speed');
  assert(front.speed>10,'front kart receives momentum');
  assert(Math.abs(rear.lane)<.05&&Math.abs(front.lane)<.05,'rear-end impact does not eject both karts sideways');
  const separation=Math.abs((rear.s-front.s)*trackLength);
  assert(separation>=KART_CONTACT_LENGTH*.99,'rear-end overlap is resolved in one step');
}

{
  const left=racer(0,{lane:0,laneVel:7,speed:24});
  const right=racer(1,{lane:2.3,laneVel:0,speed:24});
  const hit=resolveKartPair(left,right,trackLength);
  assert(hit&&hit.impact>5,'side-swipe produces lateral impulse');
  assert(left.bumpLane<0&&right.bumpLane>0,'side-swipe pushes karts apart in the correct directions');
  assert(right.lane-left.lane>=KART_CONTACT_WIDTH*.99,'side overlap is fully resolved');
  assert(Math.abs(left.speed-right.speed)<3,'side-swipe does not create a fake rear-end speed transfer');
}

{
  const a=racer('a');
  const b=racer('b');
  const hit=resolveKartPair(a,b,trackLength);
  assert(hit,'perfect overlap still resolves deterministically');
  assert(Math.abs(a.lane-b.lane)>=KART_CONTACT_WIDTH*.99,'stationary overlap separates without NaN or jitter');
  assert(Number.isFinite(a.s)&&Number.isFinite(b.s)&&Number.isFinite(a.lane)&&Number.isFinite(b.lane));
}

{
  const farA=racer(0,{s:.2,lane:-3});
  const farB=racer(1,{s:.25,lane:3});
  assert.equal(resolveKartPair(farA,farB,trackLength),null,'distant karts do not collide');
}

{
  const wall=racer(0,{lane:12,speed:40,laneVel:9,headingOffset:.2});
  const hit=resolveTrackEdge(wall,17);
  assert(hit&&hit.impact>0,'wall crossing resolves');
  assert.equal(wall.lane,17*.64,'kart is placed exactly at the hard edge');
  assert(wall.bumpLane<0,'right wall bounces the kart back toward the road');
  assert(wall.speed>30,'wall scrape sheds speed without the previous catastrophic stop');
  assert(wall.headingOffset<.2,'wall adds an inward steering reaction');
}

console.log('kart physics: all deterministic collision checks passed');
