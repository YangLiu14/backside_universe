"""A release directory's name identifies all of its shipped bytes, including the viewer."""
import hashlib
import json
from pathlib import Path


def version_of(site: Path):
    hashes = {}
    for file in sorted(site.rglob('*')):
        if file.is_file():
            with file.open('rb') as stream:
                hashes[str(file.relative_to(site))] = hashlib.file_digest(stream, 'sha256').hexdigest()
    return hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest()[:16]


def check_version(site):
    if version_of(site) != site.name:
        raise ValueError(f'发布目录与内容哈希不符：{site}。请将受损目录移出 releases 后重新 build、qa。')
