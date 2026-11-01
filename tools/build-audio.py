#!/usr/bin/env python3
"""Builds the game's audio from CC0 sources (see CREDITS in README.md).

    python3 tools/build-audio.py <sfx-index-dir> <vcsl-dir> <erhu-dir>

<sfx-index-dir>: github.com/Legerdo/open-game-sfx-index (Kenney + OpenGameArt CC0 packs)
<vcsl-dir>:      github.com/sgossner/VCSL (Versilian Community Sample Library, CC0)
<erhu-dir>:      github.com/sfzinstruments/aliexpress-erhu (CC0)

Every file is trimmed, faded, normalised and encoded as small mono MP3 (decodes in every browser,
including iOS Safari). Tonal samples get their real pitch measured, so the music engine can
resample them exactly in tune. Writes src/assets/audio/*.mp3 and src/assets/audio/manifest.json.
"""
import json
import os
import subprocess
import sys

import numpy as np

SFX, VCSL, ERHU = sys.argv[1:4]
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'assets', 'audio')
os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))

A = os.path.join(SFX, 'audio')
RD = os.path.join(A, 'oga-rubberduck-rpg-80')
CR = os.path.join(A, 'oga-rubberduck-creatures-80-v2')
BR = os.path.join(A, 'oga-rubberduck-breaking-75')
RPG = os.path.join(A, 'oga-rpg-pack', 'RPG Sound Pack')
IMP = os.path.join(A, 'impact-sounds')
UI = os.path.join(A, 'interface-sounds')
DT = os.path.join(VCSL, 'Chordophones', 'Zithers', 'Dan Tranh')
PERC = os.path.join(VCSL, 'Idiophones', 'Struck Idiophones')
MEM = os.path.join(VCSL, 'Membranophones', 'Struck Membranophones')
OC = os.path.join(VCSL, 'Aerophones', 'Edge-blown Aerophones', 'Ocarina, Typical', 'Sustains', 'SusVib')

# Sound effects: game name -> source files (one is picked at random per play) and max length (s).
SOUNDS = {
    'swing': ([f'{RPG}/battle/swing.wav', f'{RPG}/battle/swing2.wav', f'{RPG}/battle/swing3.wav',
               f'{A}/oga-battle/battle_sound_effects/swish_2.wav', f'{A}/oga-battle/battle_sound_effects/swish_3.wav'], 0.5),
    'swingHeavy': ([f'{A}/oga-battle/battle_sound_effects/swish_4.wav', f'{RD}/blade_01.ogg', f'{RD}/blade_02.ogg'], 0.7),
    'hit': ([f'{A}/oga-hits-punches/hits/hit{n:02d}.mp3.flac' for n in (1, 3, 5, 8, 12, 16, 20, 24)], 0.45),
    'impact': ([f'{IMP}/impactPunch_medium_00{n}.ogg' for n in range(5)], 0.4),
    'impactHeavy': ([f'{IMP}/impactPunch_heavy_00{n}.ogg' for n in range(5)], 0.6),
    'clang': ([f'{RD}/metal_01.ogg', f'{RD}/metal_02.ogg', f'{RD}/metal_03.ogg'], 0.8),
    'rock': ([f'{BR}/bfh1_rock_breaking_01.ogg', f'{BR}/bfh1_rock_breaking_02.ogg', f'{IMP}/impactMining_000.ogg', f'{IMP}/impactMining_002.ogg'], 1.2),
    'shatter': ([f'{BR}/bfh1_wood_breaking_01.ogg', f'{BR}/bfh1_wood_breaking_02.ogg', f'{BR}/bfh1_wood_breaking_03.ogg'], 1.2),
    'coin': ([f'{RPG}/inventory/coin.wav', f'{RPG}/inventory/coin2.wav', f'{RPG}/inventory/coin3.wav'], 0.6),
    'gem': ([f'{RD}/item_gem_01.ogg', f'{RD}/item_gem_02.ogg', f'{RD}/item_gem_03.ogg'], 0.8),
    'levelup': ([f'{A}/oga-levelup-powerup/Rise03.wav'], 2.0),
    'powerup': ([f'{A}/oga-levelup-powerup/Rise01.wav'], 1.6),
    'skitter': ([f'{CR}/bug_05.ogg', f'{CR}/bug_07.ogg', f'{CR}/bug_09.ogg', f'{CR}/bug_11.ogg'], 0.5),
    'bite': ([f'{RPG}/NPC/beetle/bite-small.wav', f'{RPG}/NPC/beetle/bite-small2.wav', f'{RPG}/NPC/beetle/bite-small3.wav'], 0.5),
    'roar': ([f'{CR}/roar_04.ogg', f'{CR}/roar_05.ogg', f'{CR}/roar_06.ogg'], 2.2),
    'monster': ([f'{RPG}/NPC/giant/giant{n}.wav' for n in (1, 2, 3, 4)], 1.6),
    'ghoul': ([f'{A}/oga-zombies/zombies/zombie-{n}.wav' for n in (1, 2, 4, 7, 8, 10, 14, 17)], 1.4),
    'creatureDie': ([f'{CR}/die_01.ogg', f'{CR}/die_02.ogg', f'{CR}/die_03.ogg'], 1.2),
    'fire': ([f'{RD}/spell_fire_0{n}.ogg' for n in (1, 2, 3, 4)], 1.4),
    'fireBig': ([f'{RD}/spell_fire_0{n}.ogg' for n in (5, 6, 7)], 2.0),
    'spell': ([f'{RD}/spell_01.ogg', f'{RD}/spell_02.ogg', f'{RPG}/battle/spell.wav'], 1.6),
    'magic': ([f'{RPG}/battle/magic1.wav'], 2.0),
    'unsheathe': ([f'{RPG}/battle/sword-unsheathe.wav', f'{RPG}/battle/sword-unsheathe2.wav', f'{RPG}/battle/sword-unsheathe3.wav'], 1.0),
    'grunt': ([f'{CR}/human_0{n}.ogg' for n in (1, 2, 3, 4, 5)], 0.7),
    'cloth': ([f'{A}/rpg-audio/cloth{n}.ogg' for n in (1, 2, 3, 4)], 0.5),
    'web': ([f'{CR}/slime_0{n}.ogg' for n in (1, 2, 3, 4)], 0.8),
    'drink': ([f'{RPG}/inventory/bubble.wav', f'{RPG}/inventory/bubble2.wav', f'{RPG}/inventory/bottle.wav'], 1.0),
    'bell': ([f'{IMP}/impactBell_heavy_000.ogg', f'{IMP}/impactBell_heavy_002.ogg'], 2.5),
    'glass': ([f'{IMP}/impactGlass_light_000.ogg', f'{IMP}/impactGlass_light_002.ogg'], 0.8),
    'stepGrass': ([f'{IMP}/footstep_grass_00{n}.ogg' for n in range(5)], 0.35),
    'stepStone': ([f'{IMP}/footstep_concrete_00{n}.ogg' for n in range(5)], 0.35),
    'uiMove': ([f'{UI}/tick_001.ogg', f'{UI}/tick_002.ogg'], 0.3),
    'uiSelect': ([f'{UI}/select_001.ogg', f'{UI}/confirmation_001.ogg'], 0.6),
    'uiBack': ([f'{UI}/back_001.ogg', f'{UI}/back_002.ogg'], 0.5),
    'rain': ([f'{A}/oga-rubberduck-loops-30/rain.ogg'], 0),
}

# Instruments for the score: name -> source files (pitched ones get their pitch measured).
INSTRUMENTS = {
    'zither': ([f'{DT}/Normal/{n}_mf_1.wav' for n in ('C#2', 'F#2', 'G#2', 'b2', 'C#3', 'D#3', 'F#3', 'G#3', 'B3', 'C#4', 'D#4', 'F#4', 'G#4', 'B4')], 3.2, True),
    'zitherTrem': ([f'{DT}/Tremolo/C#3_Trem_1.wav', f'{DT}/Tremolo/F#3_Trem_1.wav'], 3.5, True),
    'zitherGliss': ([f'{DT}/Gliss/Gliss_Up_Med_mf_1.wav', f'{DT}/Gliss/Gliss_Dwn_Med_mf_1.wav'], 3.0, False),
    'erhu': ([f'{ERHU}/Samples/sus/erhu_{n}_sus_rr1.wav' for n in ('d5', 'e5', 'g5', 'a5', 'c6', 'e6')], 3.0, True),
    'flute': ([f'{OC}/StdOcarina_SusVib_{n}.wav' for n in ('C4', 'E4', 'A4')], 3.0, True),
    'taiko': ([f'{MEM}/Bass Drum 1/BDrumNew_hit_v5_rr1_Sum.wav', f'{MEM}/Bass Drum 1/BDrumNew_hit_v3_rr1_Sum.wav'], 1.6, False),
    'drumLow': ([f'{MEM}/Frame Drum/HDrumL_Hit_v3_rr1_Sum.wav'], 1.0, False),
    'drumHigh': ([f'{MEM}/Frame Drum/HDrumS_Hit_v2_rr1_Sum.wav'], 0.8, False),
    'timpani': ([f'{MEM}/Timpani 1/Hit/Timpani1_Hit_v4_rr1_Sum.wav'], 2.5, False),
    'logLow': ([f'{PERC}/Slit Drum/LogDrumLo_MedM_v2_rr1_Sum.wav'], 0.8, False),
    'logHigh': ([f'{PERC}/Slit Drum/LogDrumHi_MedM_v2_rr1_Sum.wav'], 0.6, False),
    'woodblock': ([f'{PERC}/Woodblock/wood_click_f_rr1.wav'], 0.4, False),
    'cymbal': ([f'{PERC}/Finger Cymbals/Fing_Cymb.wav'], 2.5, False),
    'gong': ([f'{PERC}/Gong 1/gong_f.wav', f'{PERC}/Gong 1/gong_mf.wav'], 6.0, False),
}


def run(args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def decode(path, rate=32000):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(rate), '-f', 'f32le', '-'],
                         check=True, stdout=subprocess.PIPE).stdout
    return np.frombuffer(raw, dtype=np.float32)


def pitch_midi(x, rate=32000):
    """Fundamental of the steady part of a note (YIN difference function), as a fractional MIDI number."""
    onset = int(np.argmax(np.abs(x) > 0.05 * np.max(np.abs(x))))
    seg = x[onset + int(0.12 * rate): onset + int(0.62 * rate)]
    if len(seg) < 4000:
        seg = x[onset: onset + 16000]
    seg = seg - seg.mean()
    lo, hi = int(rate / 2000), int(rate / 50)
    n = len(seg) - hi
    d = np.array([np.sum((seg[:n] - seg[t:t + n]) ** 2) for t in range(1, hi)])
    cmnd = d * np.arange(1, hi) / np.maximum(np.cumsum(d), 1e-9)
    cand = np.where(cmnd[lo:] < 0.15)[0]
    t = (cand[0] + lo) if len(cand) else int(np.argmin(cmnd[lo:]) + lo)
    while t + 1 < len(cmnd) and cmnd[t + 1] < cmnd[t]:
        t += 1
    # Parabolic interpolation around the minimum for sub-sample accuracy.
    if 0 < t < len(cmnd) - 1:
        a, b, c = cmnd[t - 1], cmnd[t], cmnd[t + 1]
        t = t + 0.5 * (a - c) / max(a - 2 * b + c, 1e-9)
    f0 = rate / (t + 1)
    return 69 + 12 * np.log2(f0 / 440)


def encode(src, name, max_len, loop=False):
    out = os.path.join(OUT, name + '.mp3')
    filters = ['silenceremove=start_periods=1:start_threshold=-48dB']
    if max_len:
        filters += [f'atrim=0:{max_len}', f'afade=t=out:st={max_len * 0.75:.2f}:d={max_len * 0.25:.2f}']
    filters += ['loudnorm=I=-16:TP=-1.5:LRA=11' if not loop else 'volume=1.0']
    run(['ffmpeg', '-y', '-i', src, '-ac', '1', '-ar', '32000', '-af', ','.join(filters),
         '-c:a', 'libmp3lame', '-q:a', '6', out])
    return os.path.basename(out)


# Where pitch tracking locks onto a subharmonic, use the note the sample library says it is.
PITCH_OVERRIDES = {('erhu', 5): 76.0}

manifest = {'sfx': {}, 'instruments': {}}
for name, (files, max_len) in SOUNDS.items():
    manifest['sfx'][name] = [encode(f, f'{name}{i}', max_len) for i, f in enumerate(files)]

for name, (files, max_len, pitched) in INSTRUMENTS.items():
    entries = []
    for i, f in enumerate(files):
        midi = round(float(pitch_midi(decode(f))), 2) if pitched else None
        midi = PITCH_OVERRIDES.get((name, i), midi)
        # Instruments keep their natural dynamics: peak-normalise instead of loudness-normalise.
        out = os.path.join(OUT, f'{name}{i}.mp3')
        peak = float(np.max(np.abs(decode(f))))
        gain = 0.89 / max(peak, 1e-6)
        run(['ffmpeg', '-y', '-i', f, '-ac', '1', '-ar', '32000', '-af',
             f'silenceremove=start_periods=1:start_threshold=-50dB,atrim=0:{max_len},afade=t=out:st={max_len * 0.8:.2f}:d={max_len * 0.2:.2f},volume={gain:.3f}',
             '-c:a', 'libmp3lame', '-q:a', '6', out])
        entries.append({'file': os.path.basename(out), 'midi': midi})
        print(name, os.path.basename(f), midi)
    manifest['instruments'][name] = entries

with open(os.path.join(OUT, 'manifest.json'), 'w') as fh:
    json.dump(manifest, fh, indent=1)
total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print(f'{len(os.listdir(OUT))} files, {total / 1024:.0f} KB')
