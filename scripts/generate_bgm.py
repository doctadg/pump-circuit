#!/usr/bin/env python3
"""Generate the original Pump Kart Grand Prix race loop."""
from __future__ import annotations

import math
import wave
from pathlib import Path

import numpy as np

SR = 44_100
BPM = 150
BEAT = 60 / BPM
BARS = 24
DURATION = BARS * 4 * BEAT
OUT = Path('/tmp/pump-kart-grand-prix.wav')

mix = np.zeros((int(SR * DURATION), 2), dtype=np.float64)


def midi(note: int) -> float:
    return 440.0 * (2.0 ** ((note - 69) / 12.0))


def env(n: int, attack: float = 0.012, release: float = 0.12) -> np.ndarray:
    e = np.ones(n)
    a = min(n, max(1, int(attack * SR)))
    r = min(n, max(1, int(release * SR)))
    e[:a] = np.linspace(0, 1, a)
    e[-r:] *= np.linspace(1, 0, r)
    return e


def add(sig: np.ndarray, at: float, gain: float, pan: float = 0.0) -> None:
    start = max(0, int(at * SR))
    stop = min(len(mix), start + len(sig))
    if stop <= start:
        return
    sig = sig[:stop - start] * gain
    left = math.sqrt((1 - pan) * 0.5)
    right = math.sqrt((1 + pan) * 0.5)
    mix[start:stop, 0] += sig * left
    mix[start:stop, 1] += sig * right


def synth(note: int, dur: float, kind: str = 'lead') -> np.ndarray:
    n = max(1, int(dur * SR))
    t = np.arange(n) / SR
    f = midi(note)
    if kind == 'bass':
        phase = 2 * np.pi * f * t
        sig = 0.62 * np.sin(phase) + 0.22 * np.sin(2 * phase) + 0.12 * np.sin(3 * phase)
        sig *= env(n, 0.006, min(0.16, dur * 0.55))
    elif kind == 'pluck':
        phase = 2 * np.pi * f * t
        sig = 0.55 * np.sin(phase) + 0.28 * np.sin(2.01 * phase) + 0.12 * np.sin(3.98 * phase)
        sig *= np.exp(-t * 7.5) * env(n, 0.002, min(0.08, dur * 0.4))
    elif kind == 'brass':
        vibrato = 1 + 0.003 * np.sin(2 * np.pi * 5.2 * t)
        phase = 2 * np.pi * f * t * vibrato
        sig = 0.46 * np.sin(phase) + 0.29 * np.sign(np.sin(phase)) + 0.13 * np.sin(2 * phase)
        sig *= env(n, 0.025, min(0.15, dur * 0.45))
    else:
        vibrato = 1 + 0.0025 * np.sin(2 * np.pi * 6.4 * t)
        phase = 2 * np.pi * f * t * vibrato
        saw = 2 * ((f * t) % 1) - 1
        sig = 0.43 * np.sin(phase) + 0.24 * np.sin(2 * phase) + 0.18 * saw
        sig *= env(n, 0.01, min(0.12, dur * 0.45))
    return np.tanh(sig * 1.35)


def kick(at: float, gain: float = 0.55) -> None:
    dur = 0.23
    n = int(dur * SR)
    t = np.arange(n) / SR
    phase = 2 * np.pi * (92 * t - 48 * t * t)
    sig = np.sin(phase) * np.exp(-t * 18)
    add(sig, at, gain)


def snare(at: float, gain: float = 0.34) -> None:
    dur = 0.18
    n = int(dur * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(int(at * 1000) + 2048)
    noise = rng.uniform(-1, 1, n)
    tone = np.sin(2 * np.pi * 185 * t)
    sig = (0.7 * noise + 0.3 * tone) * np.exp(-t * 22)
    add(sig, at, gain, 0.08)


def hat(at: float, gain: float = 0.11, pan: float = 0.2) -> None:
    dur = 0.055
    n = int(dur * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(int(at * 10_000) + 99)
    noise = rng.uniform(-1, 1, n)
    sig = np.concatenate([[0], np.diff(noise)]) * np.exp(-t * 72)
    add(sig, at, gain, pan)


# D-major grand-prix harmony: original, bright, and built to loop cleanly.
chords = [
    (50, [62, 66, 69]), (47, [59, 62, 66]), (43, [55, 59, 62]), (45, [57, 61, 64]),
    (50, [62, 66, 69]), (42, [54, 57, 61]), (43, [55, 59, 62]), (45, [57, 61, 64]),
] * 3

bass_pattern = [0, 7, 12, 7]
pluck_pattern = [0, 2, 1, 2, 0, 2, 1, 2]
for bar, (root, chord) in enumerate(chords):
    base = bar * 4 * BEAT
    for beat in range(4):
        note = root + bass_pattern[beat]
        add(synth(note, BEAT * 0.82, 'bass'), base + beat * BEAT, 0.23, -0.16)
        kick(base + beat * BEAT, 0.56 if beat in (0, 2) else 0.42)
        if beat in (1, 3):
            snare(base + beat * BEAT)
    for eighth in range(8):
        note = chord[pluck_pattern[eighth]] + (12 if eighth in (3, 7) else 0)
        add(synth(note, BEAT * 0.42, 'pluck'), base + eighth * BEAT / 2, 0.12, -0.35 + (eighth % 2) * 0.7)
        hat(base + eighth * BEAT / 2, 0.105 if eighth % 2 else 0.085, 0.3 if eighth % 2 else -0.25)
    for off in (0.5, 1.5, 2.5, 3.5):
        for j, note in enumerate(chord):
            add(synth(note + 12, BEAT * 0.32, 'brass'), base + off * BEAT, 0.075, -0.28 + j * 0.28)

# A playful call-and-response hook, with an octave lift in the final section.
melody = [
    (66,.5),(69,.5),(74,1),(73,.5),(71,.5),(69,1),
    (66,.5),(69,.5),(71,.5),(73,.5),(74,1),(78,1),
    (79,.5),(78,.5),(74,1),(71,.5),(69,.5),(66,1),
    (69,.5),(71,.5),(73,.5),(74,.5),(76,1),(73,1),
    (74,.5),(76,.5),(78,1),(81,.5),(78,.5),(76,1),
    (73,.5),(76,.5),(78,.5),(76,.5),(73,1),(69,1),
    (71,.5),(74,.5),(79,1),(78,.5),(74,.5),(71,1),
    (69,.5),(71,.5),(73,.5),(76,.5),(74,1),(69,1),
]
for section in range(3):
    cursor = section * 8 * 4 * BEAT
    lift = 12 if section == 2 else 0
    for idx, (note, beats) in enumerate(melody):
        duration = beats * BEAT * 0.9
        pan = 0.18 * math.sin(idx * 0.9)
        add(synth(note + lift, duration, 'lead'), cursor, 0.15 if section < 2 else 0.17, pan)
        cursor += beats * BEAT

# Finish-line brass answers and a subtle stereo echo.
for bar in range(BARS):
    if bar % 4 == 3:
        base = bar * 4 * BEAT
        root, chord = chords[bar]
        for j, note in enumerate(chord):
            add(synth(note + 12, BEAT * 0.7, 'brass'), base + 3 * BEAT, 0.13, -0.35 + j * 0.35)

# Short stereo delay for width without muddying the engine/SFX range.
delay = int(0.115 * SR)
mix[delay:, 0] += mix[:-delay, 1] * 0.11
mix[delay:, 1] += mix[:-delay, 0] * 0.11

# Gentle master saturation and normalize with headroom.
mix = np.tanh(mix * 1.15)
peak = float(np.max(np.abs(mix))) or 1.0
mix *= 0.88 / peak
pcm = (mix * 32767).astype('<i2')
OUT.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(OUT), 'wb') as wav:
    wav.setnchannels(2)
    wav.setsampwidth(2)
    wav.setframerate(SR)
    wav.writeframes(pcm.tobytes())
print(f'{OUT} {DURATION:.2f}s {SR}Hz stereo')
