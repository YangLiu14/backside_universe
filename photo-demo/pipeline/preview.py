"""Keep each open standalone preview and its relative assets on one release."""
import json
import re
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


class ReleasePreview(SimpleHTTPRequestHandler):
    def __init__(self, *args, project, **kwargs):
        self.project = project
        super().__init__(*args, directory=str(project / 'releases'), **kwargs)

    def send_head(self):
        self.versioned = False
        url = urlsplit(self.path)
        path = unquote(url.path)
        if any(part in {'.', '..'} for part in path.split('/')) or '\\' in path:
            self.send_error(HTTPStatus.NOT_FOUND)
            return None
        parts = path.lstrip('/').split('/', 1)
        if re.fullmatch(r'[0-9a-f]{16}', parts[0]):
            self.versioned = True
            if not (self.project / 'releases' / parts[0] / 'index.html').is_file():
                self.send_error(HTTPStatus.NOT_FOUND)
                return None
            return super().send_head()

        approved = self.project / 'approved-preview'
        version = (approved.resolve(strict=True).name if approved.is_symlink()
                   else json.loads((self.project / 'release.json').read_text())['version'])
        if not re.fullmatch(r'[0-9a-f]{16}', version):
            self.send_error(HTTPStatus.SERVICE_UNAVAILABLE)
            return None
        # Also redirect old direct asset URLs. A bookmark or a link carrying
        # ?view=sole now resolves every relative import under the same hash.
        location = '/' + version + '/' + url.path.lstrip('/')
        if url.query:
            location += '?' + url.query
        self.send_response(HTTPStatus.TEMPORARY_REDIRECT)
        self.send_header('Location', location)
        self.send_header('Content-Length', '0')
        self.end_headers()
        return None

    def end_headers(self):
        self.send_header('Cache-Control', 'private, max-age=31536000, immutable'
                         if getattr(self, 'versioned', False) else 'no-store')
        super().end_headers()


def serve(project: Path, port: int):
    class PreviewServer(ThreadingHTTPServer):
        request_queue_size = 128

    handler = partial(ReleasePreview, project=project)
    with PreviewServer(('127.0.0.1', port), handler) as server:
        print(f'http://127.0.0.1:{server.server_port}/', flush=True)
        server.serve_forever()
