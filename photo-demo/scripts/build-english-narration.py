"""Build local English tour audio with macOS speech and FFmpeg (no API calls).

Audio remains ignored by Git. The small manifest records copy, timing and hashes.
Run from any directory: python3 photo-demo/scripts/build-english-narration.py
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

APP = Path(__file__).resolve().parents[1]
DIST = APP / 'dist'


def build(voice='Daniel', rate=185):
    source = (DIST / 'i18n/messages.en.js').read_text()
    messages = json.loads(source.split('export const messages = ', 1)[1].rsplit(';', 1)[0])
    stops = json.loads((DIST / 'canine-museum/assets/digestion/stops.json').read_text())
    captions = json.loads((DIST / 'canine-museum/assets/digestion/galleries/captions.json').read_text())
    jobs = [(s['id']+'.m4a', messages[s['narration']], s['seconds']) for s in stops]
    jobs += [('galleries/'+key+'.m4a', messages[text], None) for key, text in captions.items()]
    def render(job):
        name, text, target = job
        output = DIST / 'canine-museum/assets/digestion/en' / name
        output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory() as temporary:
            script, audio = Path(temporary)/'copy.txt', Path(temporary)/'voice.aiff'
            script.write_text(text)
            subprocess.run(['say', '-v', voice, '-r', str(rate), '-f', str(script), '-o', str(audio)], check=True)
            seconds = float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(audio)]))
            command = ['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(audio)]
            if target:
                # The existing route's camera timing is shared by both languages.
                tempo=seconds/target
                if not .5 <= tempo <= 2:
                    raise ValueError(f'Unexpected narration timing: {name}: {tempo}')
                command += ['-af', f'atempo={tempo:.8f},apad', '-t', str(target)]
            command += ['-c:a','aac','-b:a','128k','-movflags','+faststart',str(output)]
            subprocess.run(command, check=True)
        actual=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(output)]))
        return {'file':str(output.relative_to(DIST)), 'text':text, 'seconds':actual,
                'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}
    with ThreadPoolExecutor(max_workers=3) as pool:
        records=list(pool.map(render,jobs))
    manifest={'language':'en','voice':voice,'rate':rate,'generator':'macOS say + FFmpeg', 'clips':records}
    (DIST / 'i18n/narration.en.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps({'clips':len(records),'seconds':sum(c['seconds'] for c in records)},indent=2))


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--voice',default='Daniel')
    parser.add_argument('--rate',type=int,default=185)
    args=parser.parse_args()
    build(args.voice,args.rate)
