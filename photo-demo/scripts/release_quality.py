"""Bind launch checks and visual review to immutable bytes, shared UI and current policy."""
import hashlib
import json
from html.parser import HTMLParser
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
POLICY = APP / 'deploy/quality-policy.json'


def stamp():
    digest = hashlib.sha256()
    for relative in ('deploy/quality-policy.json', 'scripts/release_quality.py',
                     'scripts/check-release.cjs', 'scripts/review-release.py', 'scripts/release-album.py',
                     'dist/cinema/premiere.css', 'dist/cinema/loading.js'):
        digest.update(relative.encode() + b'\0' + (APP / relative).read_bytes())
    return digest.hexdigest()


def receipt_dir(store, work, version):
    return store / 'quality' / work / version


def require_pass(store, work, version):
    folder = receipt_dir(store, work, version)
    report = json.loads((folder / 'report.json').read_text())
    review = json.loads((folder / 'visual-review.json').read_text())
    if report.get('work') != work or report.get('version') != version or report.get('policy') != stamp():
        raise ValueError('Quality report is for different bytes or outdated rules; run review-release.py again')
    if report.get('status') != 'pass' or report.get('errors') != []:
        raise ValueError('Launch checks have not passed')
    if review.get('report_sha256') != hashlib.sha256((folder / 'report.json').read_bytes()).hexdigest():
        raise ValueError('Visual review is stale')
    required = json.loads(POLICY.read_text())['requiredScreens']
    checks = {row['screen']: row for row in review.get('checks', [])}
    if set(checks) != set(required) or len(review.get('checks', [])) != len(required):
        raise ValueError('Review each required desktop, touch and loading screenshot')
    for name in required:
        row = checks[name]
        shot = folder / (name + '.png')
        if row.get('verdict') != 'pass' or not isinstance(row.get('note'), str) or not row['note'].strip():
            raise ValueError('Unresolved visual check: ' + name)
        if row.get('sha256') != hashlib.sha256(shot.read_bytes()).hexdigest():
            raise ValueError('Screenshot changed after review: ' + name)
    return report


def check_pin(store, work, version):
    legacy = json.loads((APP / 'deploy/legacy-quality-pins.json').read_text())
    if legacy.get(work) != version:
        require_pass(store, work, version)


class Entry(HTMLParser):
    def __init__(self):
        super().__init__(); self.styles=[]; self.attributes=[]
    def handle_starttag(self, tag, attrs):
        values=dict(attrs);self.attributes.append((tag,values))
        if tag=='link' and values.get('rel')=='stylesheet':self.styles.append(values['href'])


def check_contract(root, entry):
    """Checking the copied file prevents a private fork of the house stylesheet."""
    file = root / entry
    page=Entry();page.feed(file.read_text())
    body=next((a for tag,a in page.attributes if tag=='body'), {})
    if body.get('data-player-ui') != json.loads(POLICY.read_text())['ui'] or 'premiere' not in body.get('class','').split():
        raise ValueError('Player must use the shared premiere UI contract')
    sheets=[(file.parent/href).resolve() for href in page.styles if href.endswith('/premiere.css')]
    if len(sheets)!=1 or not sheets[0].is_relative_to(root.resolve()) or sheets[0].read_bytes() != (APP/'dist/cinema/premiere.css').read_bytes():
        raise ValueError('Package must contain the current shared cinema/premiere.css')
    for marker in ('data-album-back','data-film-loading','data-film-start','data-film-home','data-film-explore','data-load-retry'):
        if not any(marker in attrs for _,attrs in page.attributes):
            raise ValueError('Missing player contract: '+marker)
    critical = body.get('data-film-critical', '')
    resource = (file.parent / critical).resolve()
    if not critical or not resource.is_relative_to(root.resolve()) or not resource.is_file():
        raise ValueError('Declare a packaged startup resource in data-film-critical for failure/retry testing')
    return resource.relative_to(root.resolve()).as_posix()
