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
        self.works = {}
        self.stage = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script' and attrs.get('type') == 'module' and attrs.get('src'):
            self.scripts.append(attrs['src'])
        if tag == 'a' and 'data-work' in attrs:
            self.works[attrs['data-work']] = attrs['href']
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
    origin = parser.parse_args().origin.rstrip('/') + '/'
    configs = json.loads((DEPLOY / 'scenes.json').read_text())
    published = json.loads((DEPLOY / 'published-scenes.json').read_text())
    album = Page()
    data, final = fetch(origin, {'text/html'})
    album.feed(data.decode())
    if not album.works or album.works.keys() - configs.keys():
        raise SystemExit('Published album has no works or includes unknown works')
    urls = set()
    for key, revisions in published.items():
        for revision in revisions:
            urls.add(urljoin(origin, f'releases/{key}/{revision}/{configs[key]["entry"]}'))
    for key, href in album.works.items():
        entry = configs[key]['entry']
        expected = {urljoin(final, f'releases/{key}/{revision}/{entry}') for revision in published[key]}
        if urljoin(final, href) not in expected:
            raise SystemExit(f'Album links to an unrecorded scene URL for {key}: {href}')
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
