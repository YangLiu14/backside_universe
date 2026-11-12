"""Render the spatialized meeting mix to match the recorded interaction."""
import subprocess,sys,tempfile,wave
from pathlib import Path
import numpy as np
from scipy.signal import butter,sosfilt
art,video,dest=map(Path,sys.argv[1:])
sr=44100;rng=np.random.default_rng(8)
duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration',
    '-of','default=noprint_wrappers=1:nokey=1',video]))
track=np.zeros((round(duration*sr),2))
def add(data,t,pan):
    start=round(t*sr);track[start:start+len(data),0]+=data*np.sqrt((1-pan)/2)
    track[start:start+len(data),1]+=data*np.sqrt((1+pan)/2)
def speech(name,t,pan):
    data=subprocess.check_output(['ffmpeg','-loglevel','error','-i',art/(name+'.mp3'),'-ac','1','-ar',str(sr),'-f','f32le','-'])
    add(np.frombuffer(data,dtype='<f4')*.84,t,pan)
speech('welcome',7.36,-.46);speech('pair',12.78,-.28)
rain=sosfilt(butter(2,[140,2200],fs=sr,btype='bandpass',output='sos'),rng.normal(size=len(track)))
times=np.arange(len(track))/sr
at_window=np.clip((times-15)/.35,0,1)*np.clip((18.6-times)/.3,0,1)
envelope=np.clip((times-5.5)/2.25,0,1)*(.016+.010*np.clip((times-11.1)/1.6,0,1)+.010*at_window)
weather_time=times+12
envelope*=.36+.64*(.77+.16*np.sin(weather_time*.37)+.07*np.sin(weather_time*.83+.6))
add(rain*envelope,0,-.36+.36*at_window)
x=np.arange(round(.57*sr))/sr
scrape=sosfilt(butter(2,[220,1120],fs=sr,btype='bandpass',output='sos'),rng.normal(size=len(x)))
add(scrape*.17*np.sin(np.pi*x/.57)**.8*(.5+.5*np.sin(2*np.pi*11*x)**2),11.1,-.03)
for delay,f,a in [(0,1820,.095),(0,3410,.033),(.105,2090,.067),(.105,3970,.02)]:
    x=np.arange(round(.45*sr))/sr;add(a*np.sin(2*np.pi*f*x)*np.exp(-x*19),13.75+delay,.12)
with tempfile.TemporaryDirectory() as temp:
    audio=Path(temp)/'mix.wav'
    with wave.open(str(audio),'wb') as f:
        f.setparams((2,2,sr,0,'NONE','not compressed'))
        f.writeframes((np.clip(track,-1,1)*32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg','-loglevel','error','-y','-i',video,'-i',audio,'-c:v','copy','-c:a','aac','-b:a','160k','-movflags','+faststart',dest],check=True)
