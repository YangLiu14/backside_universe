"""Quiet morning atmos and one pair of running shoes; no voice or music."""
from pathlib import Path
import json, subprocess
import numpy as np
from scipy.signal import butter,sosfilt
from scipy.io.wavfile import write
from tempfile import TemporaryDirectory

rate=44100
rng=np.random.default_rng(2143)
duration=json.loads((Path(__file__).parent/'story.json').read_text())['animation']['durationSeconds']
cut=35-duration
out=np.zeros((duration*rate,2),np.float32)
def mix(start,sound,pan=0):
    i=round(start*rate);n=min(len(sound),len(out)-i)
    out[i:i+n]+=sound[:n,None]*np.sqrt([(1-pan)/2,(1+pan)/2])
def band(t,lo,hi):
    return sosfilt(butter(3,[lo,hi],btype='bandpass',fs=rate,output='sos'),rng.normal(size=len(t)))
def time(seconds):return np.arange(round(seconds*rate))/rate
t=time(duration)
for pan in [-.7,.7]:
    mix(0,.017*band(t,150,950)*(1+.18*np.sin(.32*t+pan))*np.minimum(1,t),pan)
# A light cloth scuff as the board turns, then soft passes as the road unrolls.
for start,seconds in [(3.9,.62),(17.8-cut,2.3),(20.3-cut,1.5),(22.1-cut,1.7)]:
    t=time(seconds);mix(start,.055*band(t,650,4200)*np.sin(np.pi*t/seconds)**2,.12)
# Start further away at the gate. Footfalls grow closer as the camera descends.
for i,start in enumerate(np.arange(27.1,34.0,.365)):
    t=time(.23);gain=min(1,(start-27.0)/.85)
    shoe=(.36*np.sin(2*np.pi*(82+4*i%9)*t)*np.exp(-32*t)+.32*band(t,160,1650)*np.exp(-27*t))
    shoe+=.12*band(t,1160,4200)*np.exp(-65*np.maximum(t-.036,0))*(t>.036)
    mix(start-cut,shoe*gain*np.minimum(1,t/.009)*(.79+.13*rng.random()),.13 if i%2 else -.13)
# Steam and one lid settling back on the soy-milk pot.
t=time(2.9);mix(32.1-cut,.034*band(t,2300,5500)*np.minimum(1,t/.8),.22)
t=time(.66);lid=sum(a*np.sin(2*np.pi*f*t)*np.exp(-k*t) for f,a,k in [(683,.15,12),(1175,.093,9),(1834,.052,16),(2661,.039,22)])
mix(34.04-cut,lid*np.minimum(1,t/.006),.2)
out[-int(rate*.24):]*=np.linspace(1,0,int(rate*.24))[:,None]
with TemporaryDirectory() as dr:
    wav=Path(dr)/'morning.wav';write(wav,rate,np.int16(np.clip(out,-1,1)*32767))
    subprocess.run(['ffmpeg','-y','-v','error','-i',wav,'-c:a','aac','-b:a','144k',Path(__file__).parent/'viewer/morning.m4a'],check=True)
