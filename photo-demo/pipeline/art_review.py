"""Persist an agent's visual observations alongside the evidence from one release."""
from datetime import datetime, timezone
from pathlib import Path
import re

from project import locked, read, save, sha


VERSION = re.compile(r'[0-9a-f]{16}')
MEDIA = {'.jpg', '.jpeg', '.png', '.mp4', '.webm', '.mov'}


def current_version(folder):
    pointer = folder / 'release.json'
    if not pointer.exists():
        return None
    release = read(pointer)
    version = release.get('version')
    if not isinstance(version, str) or not VERSION.fullmatch(version):
        raise ValueError('当前构建版本编号无效')
    path = folder / 'releases' / version
    if release.get('path') != 'releases/' + version or not (path / 'index.html').is_file():
        raise ValueError('当前版本目录与 release.json 不一致，请重新构建')
    return version


def is_evidence(path):
    suffix = path.suffix.lower()
    if suffix not in MEDIA or not path.is_file():
        return False
    with path.open('rb') as stream:
        header = stream.read(16)
    if suffix in {'.jpg', '.jpeg'}:
        return header.startswith(b'\xff\xd8\xff')
    if suffix == '.png':
        return header.startswith(b'\x89PNG\r\n\x1a\n')
    if suffix == '.webm':
        return header.startswith(b'\x1a\x45\xdf\xa3')
    return header[4:8] == b'ftyp' or (suffix == '.mov' and header[4:8] in {b'moov', b'mdat', b'wide'})


def evidence_files(directory):
    return {path.relative_to(directory).as_posix(): path for path in sorted(directory.rglob('*'))
            if path.resolve() == path and is_evidence(path)}


def qa_passed(directory, version):
    report = directory / 'report.json'
    if not report.is_file() or report.is_symlink():
        return False
    receipt = read(report)
    return (isinstance(receipt, dict) and receipt.get('version') == version
            and receipt.get('errors') == [] and isinstance(receipt.get('report'), list)
            and bool(receipt['report']))


def previous_review(folder, version):
    candidates = [p for p in (folder / 'qa').glob('*/art-review.json')
                  if p.parent.name != version and VERSION.fullmatch(p.parent.name)
                  and p.resolve() == p and p.is_file()]
    if candidates:
        latest = max(candidates, key=lambda path: path.stat().st_mtime_ns)
        return latest.relative_to(folder).as_posix()
    return None


def review_location(directory):
    target = directory / 'art-review.json'
    if target.is_symlink():
        raise ValueError('看片记录不能位于符号链接')
    return target


def result(folder, version, directory, media, technical_qa, review, targets):
    evidence = sorted(media)
    stale = False
    if review is not None:
        fingerprints = review.get('evidence_sha256', {})
        stale = (review.get('version') != version or set(fingerprints) != set(evidence)
                 or any(sha(media[name]) != digest for name, digest in fingerprints.items()))
    checks = review['checks'] if review and not stale else []
    covered = {check.get('target') for check in checks}
    missing = [target['id'] for target in targets if target['id'] not in covered]
    if not version:
        action = 'build'
    elif not technical_qa:
        action = 'run_qa'
    elif review is None or stale:
        action = 'inspect_keyframes'
    elif any(check['verdict'] == 'fix' for check in checks):
        action = 'repair'
    elif missing:
        action = 'inspect_keyframes'
    else:
        action = 'reviewed'
    return {'version': version, 'technical_qa': technical_qa, 'evidence': evidence,
            'evidence_root': directory.relative_to(folder).as_posix() if directory else None,
            'review': review, 'previous_review': previous_review(folder, version),
            'art_targets': targets, 'missing_targets': missing, 'stale': stale, 'next': action}


def checked_observations(data, version, media, targets):
    if not isinstance(data, dict) or data.get('version') != version:
        raise ValueError('看片记录的版本与当前构建不一致，请重新获取看片清单')
    checks = data.get('checks')
    if not isinstance(checks, list) or not checks:
        raise ValueError('checks 需要至少一项实际看片结论')
    observations = []
    target_ids = {item['id'] for item in targets}
    for check in checks:
        if not isinstance(check, dict):
            raise ValueError('每项 checks 需要 subject、evidence、verdict、note')
        subject, note, verdict = check.get('subject'), check.get('note'), check.get('verdict')
        if not all(isinstance(value, str) and value.strip() for value in [subject, note]):
            raise ValueError('检查对象和看片说明不能为空')
        if verdict not in ('pass', 'fix'):
            raise ValueError('verdict 须为 pass 或 fix')
        references = check.get('evidence')
        if not isinstance(references, list) or not references:
            raise ValueError('每项结论须引用本次实机截图或视频')
        if any(not isinstance(name, str) or name not in media for name in references):
            raise ValueError('证据须使用当前版本清单中的相对路径')
        observation = {'subject': subject.strip(), 'evidence': list(dict.fromkeys(references)),
                       'verdict': verdict, 'note': note.strip()}
        if 'target' in check:
            target = check['target']
            if not isinstance(target, str) or target not in target_ids:
                raise ValueError('target 须对应当前构建的 artTargets 中的 id')
            observation['target'] = target
        observations.append(observation)
    return observations


def read_or_record(folder, data=None, write=False):
    folder = Path(folder).resolve()
    # Same lock order as production. An in-progress QA run cannot replace a
    # screen shot between checking its path and recording its file digest.
    with locked(folder):
        version = current_version(folder)
        if version is None:
            if write:
                raise ValueError('需要先构建作品')
            targets = read(folder/'run.json').get('brief', {}).get('artTargets', [])
            return result(folder, None, None, {}, False, None, targets)
        with locked(folder, 'qa-' + version):
            directory = folder / 'qa' / version
            if directory.resolve() != directory:
                raise ValueError('验收证据目录不能位于符号链接')
            targets = read(folder/'releases'/version/'scene.json').get('artTargets', [])
            target = review_location(directory)
            media = evidence_files(directory)
            technical_qa = qa_passed(directory, version)
            if write:
                checks = checked_observations(data, version, media, targets)
                if not technical_qa and all(item['verdict'] == 'pass' for item in checks):
                    raise ValueError('记录通过结论前须先通过当前版本的技术验收')
                review = {'version': version, 'checks': checks,
                          'recorded_at': datetime.now(timezone.utc).isoformat(),
                          'evidence_sha256': {name: sha(path) for name, path in media.items()}}
                save(target, review)
            else:
                review = read(target) if target.is_file() else None
            return result(folder, version, directory, media, technical_qa, review, targets)


def packet(folder):
    return read_or_record(folder)


def record(folder, file):
    return read_or_record(folder, read(Path(file)), write=True)
