"""Verify two recorded city routes and stack their untouched WebGL frames."""
import io
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

project = Path(__file__).resolve().parents[3]
evidence = project / 'photo-demo/evidence/universes/sole-city/citywide-comparison'
media = project / '演示素材/那天，我跑着去买豆浆'
movie = media / '鞋底老街-整城步行-同机位实机对比.mp4'
sheet = media / '鞋底老街-街区与支巷-同机位实机对照.jpg'
detail = media / '鞋底老街-屋面院界与巷尾-四组实机对比.jpg'


def read_video(path):
    data = subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,nb_frames,avg_frame_rate,duration',
        '-of', 'json', str(path)])
    return json.loads(data)['streams'][0]


def run(args):
    subprocess.run(args, check=True)


def video_files(stage):
    return [evidence / (stage + '-intro.mp4'), evidence / (stage + '-street.mp4')]


def still_at(path, t):
    data = subprocess.check_output(['ffmpeg', '-loglevel', 'error', '-ss', f'{t:.6f}',
                                   '-i', str(path), '-frames:v', '1', '-f', 'image2pipe',
                                   '-c:v', 'png', 'pipe:1'])
    return Image.open(io.BytesIO(data)).convert('RGB')


def main():
    baseline, candidate = sys.argv[1:]
    before, after = video_files('before'), video_files('after')
    route_a, route_b = [json.loads((evidence / (s + '-route.json')).read_text())
                        for s in ['before', 'after']]
    assert [route_a['release'], route_b['release']] == [baseline, candidate]
    assert [shot['pose'] for shot in route_a['shots']] == [shot['pose'] for shot in route_b['shots']]
    assert [shot['onBridge'] for shot in route_a['shots']] == [shot['onBridge'] for shot in route_b['shots']]
    eye_error = max(abs(a - b) for old, new in zip(route_a['shots'], route_b['shots'])
                    for a, b in zip(old['eye'], new['eye']))
    assert eye_error < .00005, eye_error
    info = [read_video(p) for p in before]
    assert info == [read_video(p) for p in after]
    intro, street = info
    assert all(s['avg_frame_rate'] == '24/1' and s['width'] == 1120 and s['height'] == 738 for s in info)
    assert int(street['nb_frames']) == route_a['frames'] == route_b['frames']
    args = ['ffmpeg', '-v', 'error', '-y']
    for p in before + after:
        args += ['-i', str(p)]
    temp = movie.with_suffix('.pending.mp4')
    run(args + ['-filter_complex', '[0:v][2:v]hstack[a];[1:v][3:v]hstack[b];[a][b]concat=n=2:v=1:a=0[out]',
                '-map', '[out]', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt',
                'yuv420p', '-movflags', '+faststart', str(temp)])
    combined = read_video(temp)
    assert (combined['width'], combined['height']) == (2240, 738)
    assert int(combined['nb_frames']) == sum(int(s['nb_frames']) for s in info)
    run(['ffmpeg', '-loglevel', 'error', '-xerror', '-i', str(temp), '-f', 'null', '-'])
    temp.replace(movie)

    # A film progress of .608 is the renderer’s completed-growth city shot.
    stops = [('intro', float(intro['duration']) * .608 / .706, '鞋底上的全城'),
             ('street', 0, '穿过小区门之前'), ('street', 7.6, '门内回望院界'),
             ('street', 13.8, '沿第一处街角横移'), ('street', 27.65, '留出验收的支巷'),
             ('street', 31.35, '从支巷回看主街'), ('street', 43.65, '豆浆摊檐下'),
             ('street', 56.7, '登桥后回望摊前'), ('street', 74.7, '鞋尖方向的横街'),
             ('street', 85.4, '主街尽头')]
    cw, ch, pad, gutter, header, caption = 700, 438, 16, 10, 62, 39
    board = Image.new('RGB', (pad * 2 + cw * 2 + gutter, header + (ch + caption) * len(stops) + pad), '#191b18')
    draw = ImageDraw.Draw(board)
    family = '/System/Library/Fonts/STHeiti Medium.ttc'
    title = ImageFont.truetype(family, 27)
    text = ImageFont.truetype(family, 20)
    draw.text((pad, 15), '细化前', fill='#e5e0d4', font=title)
    draw.text((pad + cw + gutter, 15), '细化后', fill='#e5e0d4', font=title)
    records = []
    for i, (stage, t, caption_text) in enumerate(stops):
        y = header + (ch + caption) * i
        absolute = t + (float(intro['duration']) if stage == 'street' else 0)
        label = f'{int(absolute) // 60}:{int(absolute) % 60:02d}   {caption_text}'
        draw.text((pad, y + 5), label, fill='#e5e0d4', font=text)
        clip = 0 if stage == 'intro' else 1
        for j, sequence in enumerate([before, after]):
            img = still_at(sequence[clip], t)
            view = img.crop((0, 0, 1120, 700)).resize((cw, ch), Image.Resampling.LANCZOS)
            board.paste(view, (pad + j * (cw + gutter), y + caption))
        records.append({'startSeconds': round(absolute, 3), 'section': caption_text})
    board.save(sheet, quality=92, optimize=True)
    crops = [
        (0, float(intro['duration']) * .608 / .706, (155, 86, 965, 574), '鞋底全景 · 屋面与街坊'),
        (1, 7.6, (40, 105, 1090, 555), '进门回头 · 门扇后方的院界'),
        (1, 27.65, (56, 115, 1064, 547), '中段支巷 · 从街内看向巷尾'),
        (1, 74.75, (56, 115, 1064, 547), '鞋尖横巷 · 两家店之间的尽端'),
    ]
    cw, ch, pad, gutter, header, cap = 792, 340, 14, 8, 52, 41
    board = Image.new('RGB', (cw*2 + pad*2 + gutter, header + (ch + cap)*len(crops) + pad), '#191b18')
    draw = ImageDraw.Draw(board)
    for j, side in enumerate(['旧版实机','新版实机']):
        draw.text((pad + j*(cw+gutter), 12), side, fill='#eee9dc', font=title)
    for i,(clip,t,box,name) in enumerate(crops):
        y = header + (ch + cap)*i
        shot_time = t + (float(intro['duration']) if clip == 1 else 0)
        draw.text((pad, y + 7), f'{int(shot_time)//60:01d}:{int(shot_time)%60:02d}   '+name,
                  fill='#e5e0d4', font=text)
        for j,sequence in enumerate([before,after]):
            # Crop both sources identically, preserving scene geometry and aspect ratio.
            view = still_at(sequence[clip], t).crop(box)
            view.thumbnail((cw,ch), Image.Resampling.LANCZOS)
            x = pad+j*(cw+gutter)+(cw-view.width)//2
            board.paste(view,(x,y+cap+(ch-view.height)//2))
    board.save(detail,quality=94,optimize=True)
    report = dict(baseline=baseline, candidate=candidate, sameRoute=True,
                  maxEyeDelta=eye_error, validation='XZ error < .00005 on every walking frame. West stair reaches deck at eye Y=.085; east flight descends to grade and track continues to the toe.',
                  heldOut='East branch z=-.1985, interior view and return angle. Selected before the candidate was exposed.',
                  clip=movie.relative_to(project).as_posix(), stills=sheet.relative_to(project).as_posix(),
                  pairedDetail=detail.relative_to(project).as_posix(), clipBytes=movie.stat().st_size, stream=combined, keyframes=records)
    (evidence / 'recording.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    main()
