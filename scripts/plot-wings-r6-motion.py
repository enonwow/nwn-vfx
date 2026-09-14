"""Offline plot of authored data and Studio samples; not a native FPS test."""
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root = Path(__file__).resolve().parents[1]
out = root / 'output/wings-0220-r6-audit'
motion = json.loads((out / 'motion.json').read_text(encoding='utf-8'))
document = json.loads(Path('C:/Projects/the last city/assets/vfx/wampir/skrzydla/studio/v4/loop-candidate/effect-document.json').read_text(encoding='utf-8'))
period = motion['loopSeconds']
times = np.linspace(0, period, 1001)
keys = np.linspace(0, period, 17)
fig, axes = plt.subplots(2, 1, figsize=(12, 8), constrained_layout=True)
fig.suptitle('Skrzydła r6: poprawne próbkowanie, nierówna prędkość ruchu', fontsize=16, fontweight='bold')
axes[0].plot(times, 18*np.sin(2*np.pi*times/period)**3, color='#9b5039', label='r6: idealne 18° · sin³')
axes[0].plot(keys, 18*np.sin(2*np.pi*keys/period)**3, 'o--', color='#193f62', markersize=4, label='17 kluczy sterujących ruchem')
axes[0].plot(times, 18*np.sin(2*np.pi*times/period), color='#718a62', linestyle=':', linewidth=2, label='Porównanie: prosty sinus, ta sama amplituda')
axes[0].set_ylabel('Kąt nominalny części swobodnej (°)')
axes[0].legend(fontsize=9, loc='upper right')
layer = motion['layers'][0]
source = document['layers'][0]['animation']['vertices']
source_t = np.array([k['time'] for k in source])
source_z = np.array([k['value'][layer['tipVertex']][2] for k in source])
source_v = np.diff(source_z)/np.diff(source_t)
frames_t = np.array([k['time'] for k in layer['tipFrames']])
frames_z = np.array([k['tip'][2] for k in layer['tipFrames']])
frames_v = np.diff(frames_z)/np.diff(frames_t)
axes[1].stairs(source_v, source_t, baseline=None, color='#9b5039', linewidth=2, label='Prędkość Z z liniowych kluczy autora')
axes[1].stairs(frames_v, frames_t, baseline=None, color='#193f62', linewidth=1.3, linestyle='--', label='Prędkość Z z sampli eksportu 60 Hz')
axes[1].set_ylabel('Prędkość końcówki w osi Z (m/s)')
axes[1].set_xlabel('Czas jednej pętli (s)')
axes[1].legend(fontsize=9, loc='lower left')
for ax in axes:
    ax.set_xlim(0, period)
    ax.axhline(0, color='#aaaaaa', linewidth=.6)
    ax.grid(alpha=.18)
    ax.spines[['top', 'right']].set_visible(False)
fig.text(.5, -.01, 'Dane autora i eksportu; wykres nie mierzy FPS ani interpolacji NWN.', ha='center', fontsize=10, color='#555555')
fig.savefig(out/'motion.png', dpi=160, bbox_inches='tight')
fig.savefig(out/'motion.svg', bbox_inches='tight')
print(out/'motion.png')
