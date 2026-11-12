"""Check published scene entry documents and their scripts through the visitor-facing domain."""
import argparse
import json
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from urllib.request import urlopen

DEPLOY = Path(__file__).resolve().parents[1] / 'deploy'


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.stage = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script' and attrs.get('type') == 'module' and attrs.get('src'):
            self.scripts.append(attrs['src'])
        if 'data-album-back' in attrs:
            self.stage = True


def fetch(url, expected_types):
    with urlopen(url, timeout=30) as response:
        if response.status != 200 or response.headers.get_content_type() not in expected_types:
            raise ValueError(f'{url}: {response.status} {response.headers.get_content_type()}')
        if urlsplit(response.url)[:2] != urlsplit(url)[:2]:
            raise ValueError(f'{url}: cross-origin scene redirect')
        return response.read(), response.url


def scene(url):
    data, final = fetch(url, {'text/html'})
    page = Page()
    page.feed(data.decode())
    if not page.stage or not page.scripts:
        raise ValueError(f'{url}: missing screening controls or modules')
    for src in page.scripts:
        fetch(urljoin(final, src), {'text/javascript', 'application/javascript'})
    return url


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', default='https://backside-universe.netlify.app')
    parser.add_argument('--expect-catalog', type=Path, help='Compare the served catalog with the tested snapshot')
    args = parser.parse_args()
    origin = args.origin.rstrip('/') + '/'
    configs = json.loads((DEPLOY / 'scenes.json').read_text())
    published = json.loads((DEPLOY / 'published-scenes.json').read_text())
    pins = json.loads((DEPLOY / 'releases.json').read_text())
    data, _ = fetch(urljoin(origin, 'catalog/works.json'), {'application/json'})
    catalog = json.loads(data)
    if args.expect_catalog and catalog != json.loads(args.expect_catalog.read_text()):
        raise SystemExit('Served catalog differs from the tested snapshot')
    works = catalog['works']
    if len(works) != len(configs) or {work['id'] for work in works} != set(configs):
        raise SystemExit('Published catalog differs from registered works')
    urls = {urljoin(origin, f'releases/{key}/{revision}/{configs[key]["entry"]}')
            for key, revisions in published.items() for revision in revisions}
    photos = set()
    for work in works:
        key = work['id']
        if work['entry'] != f'/releases/{key}/{pins[key]}/{configs[key]["entry"]}':
            raise SystemExit(f'Catalog has the wrong scene version for {key}')
        for image in [work['front'], work['back'], *work['strip']]:
            photos.add(urljoin(origin, image['src']))
    for url in sorted(photos):
        fetch(url, {'image/webp', 'image/png', 'image/jpeg'})
    failures = []
    with ThreadPoolExecutor(max_workers=4) as executor:
        requests = {url: executor.submit(scene, url) for url in sorted(urls)}
        for url, result in requests.items():
            try:
                print('OK', result.result())
            except (ValueError, OSError) as error:
                failures.append(f'FAIL {url}: {error}')
    if failures:
        raise SystemExit('\n'.join(failures))


if __name__ == '__main__':
    main()
