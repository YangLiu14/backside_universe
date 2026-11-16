#!/usr/bin/env python3
"""Offline 48 kHz promo mix: tape motor and synthetic basketball/net foley.

No downloaded music or sound library is used. Physics event times come from the
verified release's browser measurements, not a separately approximated shot.
Human speech is intentionally omitted; the scene keeps its written captions.
Run with the project's Gaussian venv (NumPy/SciPy) and ffmpeg on PATH.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

import numpy as np
from scipy.signal import butter, lfilter, resample_poly, sosfilt


RATE = 48000


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def run(args, data=None):
    return subprocess.run(args, input=data, check=True, capture_output=True)


def envelope(length, fade_in=.01, fade_out=.04):
    result = np.ones(length)
    front = min(length, round(fade_in * RATE))
    back = min(length, round(fade_out * RATE))
    if front:
        result[:front] *= np.sin(np.linspace(0, np.pi / 2, front)) ** 2
    if back:
        result[-back:] *= np.cos(np.linspace(0, np.pi / 2, back)) ** 2
    return result


def motor(seconds):
    # Same seeded strip, 120-radian/sec modulation, 1250 Hz bandpass and Q=.65
    # as viewer/sound.js. RBJ biquad reproduces Web Audio's bandpass topology.
    seed = 32177
    strip = np.empty(RATE)
    for i in range(RATE):
        seed = seed * 16807 % 2147483647
        strip[i] = (seed / 2147483647 - .5) * (.7 + .3 * np.sin(i / RATE * 120))
    omega = 2 * np.pi * 1250 / RATE
    alpha = np.sin(omega) / (2 * .65)
    b = np.array([alpha, 0, -alpha]) / (1 + alpha)
    a = np.array([1 + alpha, -2 * np.cos(omega), 1 - alpha]) / (1 + alpha)
    return lfilter(b, a, np.resize(strip, round(seconds * RATE)))


def impact(rng, strength):
    # Rubber-shell resonance and a short pavement transient, made from scratch.
    t = np.arange(round(.25 * RATE)) / RATE
    phase = 2 * np.pi * (85 * t + 62 * .014 * (1 - np.exp(-t / .014)))
    tone = np.sin(phase) * np.exp(-t / .052)
    shell = .23 * np.sin(2 * np.pi * 238 * t) * np.exp(-t / .024)
    noise = sosfilt(butter(2, [650, 4300], btype='bandpass', fs=RATE, output='sos'),
                    rng.standard_normal(len(t)))
    surface = .19 * noise * np.exp(-t / .009)
    sound = (tone + shell + surface) * envelope(len(t), .0008, .025)
    return sound / max(1e-12, np.max(np.abs(sound))) * .40 * strength


def net_swish(rng):
    n = round(.19 * RATE)
    noise = sosfilt(butter(2, [950, 6800], btype='bandpass', fs=RATE, output='sos'),
                    rng.standard_normal(n))
    return noise / np.max(np.abs(noise)) * .065 * envelope(n, .02, .13)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    repo = Path(__file__).resolve().parents[3]
    evidence = repo / 'photo-demo/evidence/universes/after-school-rewind'
    parser.add_argument('--release', type=Path, default=evidence / 'releases/b9e17ac9ae84e233')
    parser.add_argument('--metrics', type=Path, default=evidence / 'qa/b9e17ac9ae84e233/motion/desktop-motion-metrics.json')
    parser.add_argument('--out', type=Path, default=evidence / 'promo/audio')
    parser.add_argument('--duration', type=float, default=42)
    parser.add_argument('--first-rewind', type=float, nargs=2, default=[8, 20])
    parser.add_argument('--forward-start', type=float, default=20)
    parser.add_argument('--second-rewind', type=float, nargs=2, default=[28, 41])
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    metrics = json.loads(args.metrics.read_text())['basketball']
    scene_duration = 8.0
    assert args.first_rewind[1] == args.forward_start
    assert args.forward_start + scene_duration == args.second_rewind[0]
    assert args.second_rewind[1] <= args.duration
    mix = np.zeros((round(args.duration * RATE), 2), dtype=np.float64)
    cues = []
    rng = np.random.default_rng(20261116)

    def add(sound, start, pan=0., gain=1., echo=False):
        # Equal-power pan; the very quiet reflection belongs to the same sound.
        start_sample = round(start * RATE)
        channels = np.array([np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)])
        n = min(len(sound), len(mix) - start_sample)
        assert start_sample >= 0 and n == len(sound), 'Audio cue exceeds picture'
        mix[start_sample:start_sample + n] += sound[:, None] * channels * gain
        if echo:
            reflected = start_sample + round(.074 * RATE)
            n = min(n, len(mix) - reflected)
            mix[reflected:reflected + n] += sound[:n, None] * channels[::-1] * gain * .075

    for number, (start, end) in enumerate([args.first_rewind, args.second_rewind], 1):
        tape = motor(end - start)
        # Passing out of the studio attenuates the motor; returning restores it.
        gain = np.linspace(.13, .045, len(tape)) if number == 1 else np.linspace(.035, .13, len(tape))
        tape *= gain * envelope(len(tape), .06, .045)
        add(tape, start, -.22)
        cues.append(dict(kind='tape-motor', start=start, end=end,
                         source='viewer/sound.js seeded synthesis', reverse=number))

    net_entry = next(e['time'] for e in metrics['eventContinuity'] if e['type'] == 'net-entry')
    swish = net_swish(rng)
    add(swish, args.forward_start + net_entry, .24, 1., True)
    cues.append(dict(kind='net', sceneTime=net_entry, start=args.forward_start + net_entry,
                     source='procedural filtered-noise net swish'))
    for index, event in enumerate(metrics['restitution']):
        time = event['time']
        strength = (abs(event['incomingVelocityY']) / abs(metrics['restitution'][0]['incomingVelocityY'])) ** .78
        sound = impact(rng, strength)
        start = args.forward_start + time
        add(sound, start, .16 + index * .025, echo=True)
        cues.append(dict(kind='ball-impact', index=index + 1, sceneTime=time, start=start,
                         source='procedural rubber resonance and pavement transient', strength=strength))
        # Reverse the entire effect, stretch to the slowed reverse timeline and
        # align its leading impact to the exact inverse event (tail precedes it).
        reverse_start, reverse_end = args.second_rewind
        reverse_rate = (reverse_end - reverse_start) / scene_duration
        reverse = resample_poly(sound[::-1], round(reverse_rate * 1000), 1000)
        contact_time = reverse_start + (scene_duration - time) * reverse_rate
        reverse_at = contact_time - (len(reverse) - 1) / RATE
        progress = (contact_time - reverse_start) / (reverse_end - reverse_start)
        add(reverse, reverse_at, .20, max(.055, .42 * (1 - progress)) )
        cues.append(dict(kind='reverse-ball-impact', index=index + 1, sceneTime=time,
                         contact=contact_time, start=reverse_at, playbackRate=1 / reverse_rate))

    # Keep ample PCM and AAC reconstruction headroom without compression.
    measured_peak = float(np.max(np.abs(mix)))
    master_gain = min(1.65, 10 ** (-3 / 20) / max(measured_peak, 1e-12))
    mix *= master_gain
    final_peak = float(np.max(np.abs(mix)))
    assert np.isfinite(mix).all() and final_peak < .708
    wav = args.out / '铅笔倒带-宣传片-声音.wav'
    run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(RATE), '-ac', '2', '-i',
         'pipe:0', '-c:a', 'pcm_s24le', str(wav)], mix.astype('<f4').tobytes())
    measurement = run(['ffmpeg', '-hide_banner', '-i', str(wav), '-af',
                       'loudnorm=I=-20:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'])
    text = measurement.stderr.decode()
    loudness = json.loads(re.findall(r'\{[^{}]+\}', text)[-1])
    assert float(loudness['input_tp']) <= -1.5
    metadata = dict(duration=args.duration, rate=RATE, channels=2, format='PCM signed 24-bit',
                    soundtrack=str(wav), soundtrackSHA256=digest(wav), speechEnabled=False, cues=cues,
                    masterGain=master_gain, samplePeakDBFS=20 * np.log10(final_peak),
                    measuredTruePeakDBTP=float(loudness['input_tp']),
                    integratedLUFS=float(loudness['input_i']), loudnessRange=float(loudness['input_lra']),
                    sourceRelease=args.release.name, metrics=str(args.metrics), metricsSHA256=digest(args.metrics),
                    notes=['No music or externally sourced foley.',
                           'No human speech or broadcast audio. Motor adapted from viewer/sound.js; basketball/net sounds are synthesized.',
                           'Seven forward ground contacts and seven inverse contacts match actual release physics events.',
                           'Low motor sound carries both rewinds; the forward action contains only basketball and net foley.',
                           'LUFS includes intentional quiet picture opening and ending; no global loudness boost applied.'])
    (args.out / 'soundtrack.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: metadata[k] for k in ['soundtrack', 'duration', 'rate', 'channels', 'samplePeakDBFS', 'measuredTruePeakDBTP', 'integratedLUFS']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
