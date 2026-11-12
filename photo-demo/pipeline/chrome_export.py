"""Find the completed Chrome download from one isolated Hi3D export tab."""
import json
from pathlib import Path
import sqlite3
import sys
from urllib.parse import parse_qs, urlsplit


def completed_download(histories, ticket):
    matches = []
    for history in histories:
        # Chrome on macOS can exclusively lock History. Read only committed pages.
        with sqlite3.connect(history.as_uri() + '?mode=ro&immutable=1', uri=True) as db:
            rows = db.execute("""
                SELECT tab_url, target_path, state, received_bytes, total_bytes, c.url
                FROM downloads d JOIN downloads_url_chains c ON c.id = d.id AND c.chain_index = 0
                WHERE tab_url LIKE ?""", ('%' + ticket + '%',))
            for tab, path, state, received, total, url in rows:
                page = urlsplit(tab)
                if (page.scheme != 'https' or page.netloc != 'www.hi3d.ai' or page.path != '/zh/workspace'
                        or parse_qs(page.query).get('backside_export') != [ticket]):
                    continue
                if not url.startswith('blob:https://www.hi3d.ai/'):
                    raise ValueError('下载来源与官网工作区不符')
                matches.append((state, Path(path), received, total))
    if len(matches) > 1:
        raise ValueError('专用标签页出现多个下载，需重新导出')
    if matches:
        state, path, received, total = matches[0]
        if state == 1 and path.suffix.lower() == '.glb' and path.is_file():
            if received > 0 and received == path.stat().st_size and (total <= 0 or total == received):
                return str(path)
    return None


if __name__ == '__main__':
    roots = [Path.home()/'Library/Application Support/Google/Chrome', Path.home()/'.config/google-chrome',
             Path.home()/'.config/chromium']
    print(json.dumps(completed_download([p for root in roots for p in root.glob('*/History')], sys.argv[1])))
