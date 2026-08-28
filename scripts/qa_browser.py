#!/usr/bin/env python3
"""CDP smoke/visual QA for the single-file Pump Kart frontend."""
from __future__ import annotations

import base64
import json
import math
import time
from pathlib import Path
from urllib.parse import quote

import requests
import websocket

CDP_HTTP = 'http://127.0.0.1:9239'
APP = 'http://127.0.0.1:5178/'
OUT = Path(__file__).resolve().parents[1]


class CDP:
    def __init__(self, ws_url: str):
        self.ws = websocket.create_connection(ws_url, timeout=10)
        self.seq = 0
        self.events: list[dict] = []

    def send(self, method: str, params: dict | None = None) -> dict:
        self.seq += 1
        ident = self.seq
        self.ws.send(json.dumps({'id': ident, 'method': method, 'params': params or {}}))
        deadline = time.time() + 20
        while time.time() < deadline:
            message = json.loads(self.ws.recv())
            if message.get('id') == ident:
                if 'error' in message:
                    raise RuntimeError(f'{method}: {message["error"]}')
                return message.get('result', {})
            self.events.append(message)
        raise TimeoutError(method)

    def evaluate(self, expression: str):
        result = self.send('Runtime.evaluate', {'expression': expression, 'returnByValue': True, 'awaitPromise': True})
        payload = result.get('result', {})
        if payload.get('subtype') == 'error':
            raise RuntimeError(payload.get('description', expression))
        return payload.get('value')

    def drain(self, seconds: float = 0.25) -> None:
        end = time.time() + seconds
        self.ws.settimeout(0.05)
        while time.time() < end:
            try:
                self.events.append(json.loads(self.ws.recv()))
            except Exception:
                pass
        self.ws.settimeout(10)

    def screenshot(self, path: Path) -> None:
        data = self.send('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': False})['data']
        path.write_bytes(base64.b64decode(data))


def wait_until(cdp: CDP, expression: str, timeout: float = 20) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if cdp.evaluate(expression):
            return
        time.sleep(0.2)
    raise TimeoutError(expression)


def set_viewport(cdp: CDP, width: int, height: int, mobile: bool = False) -> None:
    cdp.send('Emulation.setDeviceMetricsOverride', {
        'width': width, 'height': height, 'deviceScaleFactor': 1,
        'mobile': mobile, 'screenWidth': width, 'screenHeight': height,
    })


def key(cdp: CDP, code: str, down: bool) -> None:
    text = {'KeyW': 'w', 'KeyA': 'a', 'KeyD': 'd'}.get(code, '')
    cdp.send('Input.dispatchKeyEvent', {
        'type': 'keyDown' if down else 'keyUp', 'code': code,
        'key': text if down else text, 'windowsVirtualKeyCode': ord(text.upper()) if text else 0,
    })


def turn_metrics(samples: list[dict]) -> dict:
    def angle_step(a: float, b: float) -> float:
        return abs(math.atan2(math.sin(b - a), math.cos(b - a)))
    pairs = list(zip(samples, samples[1:]))
    return {
        'frames': len(samples),
        'maxYawStep': max((angle_step(a['worldYaw'], b['worldYaw']) for a, b in pairs), default=0),
        'maxVisualYawStep': max((angle_step(a['visualYaw'], b['visualYaw']) for a, b in pairs), default=0),
        'maxCameraYawStep': max((angle_step(a['cameraYaw'], b['cameraYaw']) for a, b in pairs), default=0),
        'maxLaneStep': max((abs(b['lane'] - a['lane']) for a, b in pairs), default=0),
        'maxWorldStep': max((math.hypot(b['x'] - a['x'], b['z'] - a['z']) for a, b in pairs), default=0),
        'finite': all(math.isfinite(value) for sample in samples for value in sample.values()),
    }


def main() -> None:
    target = requests.put(f'{CDP_HTTP}/json/new?{quote(APP, safe=":/")}', timeout=10).json()
    cdp = CDP(target['webSocketDebuggerUrl'])
    for domain in ('Page.enable', 'Runtime.enable', 'Log.enable', 'Network.enable'):
        cdp.send(domain)
    set_viewport(cdp, 1440, 900)
    cdp.send('Page.navigate', {'url': APP})
    wait_until(cdp, '!!window.__pumpKart')
    wait_until(cdp, 'window.__pumpKart.freeAssetCount===31', timeout=30)

    report: dict = {'tracks': [], 'boxPickup': {}, 'crateStress': {}, 'camera': {}, 'collision': {}, 'manualDrive': {}, 'steering': {}, 'turnSmoothness': {}, 'viewport': {}, 'errors': []}
    track_names = ['pump-park', 'bonding-beach', 'moon-market']
    focus_s = [0.34, 0.40, 0.31]
    for idx, name in enumerate(track_names):
        cdp.evaluate(f'window.__pumpKart.startRaceNow({idx},1); true')
        wait_until(cdp, "window.__pumpKart.mode==='race'", timeout=30)
        if idx == 0:
            report['camera'] = cdp.evaluate("({fov:window.__pumpKart.cameraPose.fov,position:window.__pumpKart.cameraPose.position,kartScale:window.__pumpKart.kartScale,fxDrawCalls:window.__pumpKart.microFxDrawCalls,version:window.__pumpKart.version})")
            cdp.evaluate('window.__pumpKart.stressPickups(500);true')
            time.sleep(.15)
            report['crateStress'] = cdp.evaluate("({alive:true,fx:window.__pumpKart.microFxCount,fxDrawCalls:window.__pumpKart.microFxDrawCalls,errors:window.__pumpKart.errors})")
            cdp.evaluate("Object.assign(window.__pumpKart.racers[0],{s:.0948,lane:0,speed:0,worldYaw:null,velocityYaw:null,visualYaw:null,cameraYaw:null,yawRate:0,item:null,roulette:0,boxLock:0});true")
            time.sleep(.35)
            report['boxPickup'] = cdp.evaluate("(()=>{const r=window.__pumpKart.racers[0];return {roulette:r.roulette,item:r.item?.id||null,boxLock:r.boxLock,fx:window.__pumpKart.microFxCount,slot:document.querySelector('#itemSlot').className,svg:!!document.querySelector('#itemIcon svg'),noEmoji:!/[\\u{1F000}-\\u{1FAFF}]/u.test(document.body.innerText)}})()")
        cdp.evaluate(f'window.__pumpKart.racers[0].s={focus_s[idx]};window.__pumpKart.racers[0].speed=0;window.__pumpKart.racers[0].worldYaw=null;window.__pumpKart.racers[0].velocityYaw=null;window.__pumpKart.racers[0].visualYaw=null;window.__pumpKart.racers[0].cameraYaw=null;window.__pumpKart.racers[0].yawRate=0;true')
        time.sleep(0.9)
        info = cdp.evaluate("({name:window.__pumpKart.track.name,animations:window.__pumpKart.worldAnimations,freeAssets:window.__pumpKart.freeAssetCount,scenery:window.__pumpKart.sceneryObjects,music:window.__pumpKart.musicReady,errors:window.__pumpKart.errors})")
        cdp.screenshot(OUT / f'qa-world-{name}.png')
        report['tracks'].append(info)

    # Rear-end contract: transfer forward momentum, never eject both karts sideways.
    cdp.evaluate('window.__pumpKart.startRaceNow(0,1);true')
    cdp.evaluate("(()=>{const rs=window.__pumpKart.racers;rs.slice(2).forEach((r,i)=>Object.assign(r,{finished:true,s:.5+i*.03,lane:6}));Object.assign(rs[0],{finished:true,s:.3,lane:0,speed:35,laneVel:0,bumpLane:0});Object.assign(rs[1],{finished:true,s:.303,lane:0,speed:10,laneVel:0,bumpLane:0});window.__pumpKart.resolveContacts();return true})()")
    report['collision'] = cdp.evaluate("(()=>{const [rear,front]=window.__pumpKart.racers;let ds=Math.abs(rear.s-front.s);if(ds>.5)ds=1-ds;return{rear:{s:rear.s,lane:rear.lane,speed:rear.speed,bumpLane:rear.bumpLane},front:{s:front.s,lane:front.lane,speed:front.speed,bumpLane:front.bumpLane},separation:ds*window.__pumpKart.trackLength,errors:window.__pumpKart.errors}})()")

    # Holding throttle alone must not rotate the kart with the track spline.
    cdp.evaluate('window.__pumpKart.startRaceNow(0,1);true')
    cdp.evaluate("(()=>{const rs=window.__pumpKart.racers;rs.slice(1).forEach((r,i)=>Object.assign(r,{finished:true,s:.6+i*.03,lane:7}));Object.assign(rs[0],{s:.24,lane:0,speed:34,worldYaw:null,yawRate:0,headingOffset:0});return true})()")
    cdp.evaluate('window.__pumpKart.stepFrames(8);true')
    manual_before = cdp.evaluate('({s:window.__pumpKart.racers[0].s,lane:window.__pumpKart.racers[0].lane,heading:window.__pumpKart.racers[0].headingOffset,worldYaw:window.__pumpKart.racers[0].worldYaw})')
    key(cdp, 'KeyW', True)
    cdp.evaluate('window.__pumpKart.stepFrames(90);true')
    key(cdp, 'KeyW', False)
    manual_after = cdp.evaluate('({s:window.__pumpKart.racers[0].s,lane:window.__pumpKart.racers[0].lane,heading:window.__pumpKart.racers[0].headingOffset,worldYaw:window.__pumpKart.racers[0].worldYaw})')
    report['manualDrive'] = {'before': manual_before, 'after': manual_after}

    # Direction contract regression: D and A must produce opposite intended turns.
    cdp.evaluate('window.__pumpKart.startRaceNow(0,1);true')
    wait_until(cdp, "window.__pumpKart.mode==='race'", timeout=30)
    key(cdp, 'KeyW', True)
    cdp.evaluate('window.__pumpKart.stepFrames(30);true')
    before_d = cdp.evaluate('({lane:window.__pumpKart.racers[0].lane,heading:window.__pumpKart.racers[0].headingOffset})')
    key(cdp, 'KeyD', True)
    d_samples = cdp.evaluate('window.__pumpKart.stepFrames(48)')
    key(cdp, 'KeyD', False)
    after_d = cdp.evaluate('({lane:window.__pumpKart.racers[0].lane,heading:window.__pumpKart.racers[0].headingOffset})')
    key(cdp, 'KeyW', False)
    cdp.evaluate('window.__pumpKart.startRaceNow(0,1);true')
    key(cdp, 'KeyW', True)
    cdp.evaluate('window.__pumpKart.stepFrames(30);true')
    before_a = cdp.evaluate('({lane:window.__pumpKart.racers[0].lane,heading:window.__pumpKart.racers[0].headingOffset})')
    key(cdp, 'KeyA', True)
    a_samples = cdp.evaluate('window.__pumpKart.stepFrames(48)')
    key(cdp, 'KeyA', False)
    key(cdp, 'KeyW', False)
    after_a = cdp.evaluate('({lane:window.__pumpKart.racers[0].lane,heading:window.__pumpKart.racers[0].headingOffset})')
    report['steering'] = {'beforeD': before_d, 'afterD': after_d, 'beforeA': before_a, 'afterA': after_a}
    report['turnSmoothness'] = {'right': turn_metrics(d_samples), 'left': turn_metrics(a_samples)}

    set_viewport(cdp, 390, 844, True)
    cdp.evaluate('window.__pumpKart.startRaceNow(1,1);true')
    wait_until(cdp, "window.__pumpKart.mode==='race'", timeout=30)
    cdp.evaluate('window.__pumpKart.racers[0].s=.42;window.__pumpKart.racers[0].speed=28;window.__pumpKart.racers[0].worldYaw=null;window.__pumpKart.racers[0].velocityYaw=null;window.__pumpKart.racers[0].visualYaw=null;window.__pumpKart.racers[0].cameraYaw=null;window.__pumpKart.racers[0].yawRate=0;true')
    time.sleep(0.8)
    report['viewport'] = cdp.evaluate("({inner:[innerWidth,innerHeight],scroll:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],music:window.__pumpKart.musicReady,errors:window.__pumpKart.errors})")
    cdp.screenshot(OUT / 'qa-world-mobile.png')

    cdp.drain()
    for event in cdp.events:
        method = event.get('method')
        params = event.get('params', {})
        if method == 'Runtime.exceptionThrown':
            report['errors'].append(params.get('exceptionDetails', {}).get('text', 'Runtime.exception'))
        elif method == 'Log.entryAdded' and params.get('entry', {}).get('level') == 'error':
            text = params['entry'].get('text', '')
            if 'favicon.ico' not in text:
                report['errors'].append(text)
        elif method == 'Network.loadingFailed':
            report['errors'].append(f"network: {params.get('errorText')} {params.get('type')}")
    print(json.dumps(report, indent=2))
    if report['errors'] or any(t['errors'] for t in report['tracks']) or report['viewport']['errors']:
        raise SystemExit(2)
    if not all(t['music'] for t in report['tracks']):
        raise SystemExit('music did not play')
    if not all(t['freeAssets'] == 31 and t['scenery'] >= 100 for t in report['tracks']):
        raise SystemExit('free asset scenery incomplete')
    if (report['boxPickup']['roulette'] <= 0 and not report['boxPickup']['item']) or report['boxPickup']['fx'] <= 0 or 'roulette' not in report['boxPickup']['slot'] or not report['boxPickup']['svg'] or not report['boxPickup']['noEmoji']:
        raise SystemExit('item box microinteraction regression')
    if not report['crateStress']['alive'] or report['crateStress']['fx'] > 66 or report['crateStress']['fxDrawCalls'] != 3 or report['crateStress']['errors']:
        raise SystemExit('item box performance regression')
    if report['camera']['fov'] != 58 or report['camera']['kartScale'] != .64 or report['camera']['fxDrawCalls'] != 3 or report['camera']['version'] != 'pump-kart-smooth-handling-v12':
        raise SystemExit('fixed chase camera regression')
    if report['collision']['rear']['speed'] >= 35 or report['collision']['front']['speed'] <= 10 or abs(report['collision']['rear']['lane']) > .05 or abs(report['collision']['front']['lane']) > .05 or report['collision']['separation'] < 3.5 or report['collision']['errors']:
        raise SystemExit('kart collision physics regression')
    if abs(report['manualDrive']['after']['heading']) < .08 and abs(report['manualDrive']['after']['lane'] - report['manualDrive']['before']['lane']) < .35:
        raise SystemExit('throttle-only spline auto-steering regression')
    if report['viewport']['scroll'][0] > report['viewport']['inner'][0]:
        raise SystemExit('mobile horizontal overflow')
    if after_d['lane'] <= after_a['lane'] + .5 or after_d['heading'] <= after_a['heading'] + .15:
        raise SystemExit('A/D direction regression')
    if any((not turn['finite'] or turn['frames'] != 48 or turn['maxYawStep'] > .03 or turn['maxVisualYawStep'] > .03 or turn['maxCameraYawStep'] > .03 or turn['maxLaneStep'] > .5 or turn['maxWorldStep'] > 1.2) for turn in report['turnSmoothness'].values()):
        raise SystemExit('turn smoothing regression')


if __name__ == '__main__':
    main()
