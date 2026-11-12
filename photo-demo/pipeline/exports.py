"""Import an original only against a recorded website export or a pinned legacy catalog entry."""
import re
import shutil
from urllib.parse import urlsplit

from hi3d import check_glb
from project import APP, job_key, model_input, read, sha


def task_id_from_page(source, *, historical=False):
    url = urlsplit(source)
    hosts = {'hi3d.ai', 'www.hi3d.ai'}
    if historical:
        hosts.add('www.hi3d.cn')
    match = re.fullmatch(r'/(?:[a-z]{2}/)?3d-model/([a-zA-Z0-9_-]{1,200})/?', url.path)
    if url.scheme != 'https' or url.netloc not in hosts or not match:
        raise ValueError('请提供 Hi3D 模型页及任务 ID')
    return match[1]


def website_export(folder, task):
    if not re.fullmatch(r'[a-zA-Z0-9_-]{1,200}', task):
        raise ValueError('官网任务 ID 无效')
    directory = folder.parent/'.hi3d-exports'/task
    if not (directory/'receipt.json').is_file():
        raise ValueError('缺少该任务的官网导出记录，请先从原任务运行 captureExport')
    receipt = read(directory/'receipt.json')
    if receipt.get('method') != 'hi3d-workspace-download' or receipt.get('task') != task:
        raise ValueError('官网导出记录与指定任务不一致')
    return directory/'original.glb', receipt


def import_original(folder, key, job, source, expected):
    if job.get('sha256') and job['sha256'] != expected and (
            job['route'] != 'archive' or job.get('export') or job.get('catalog_id')):
        raise ValueError('该任务的既有原件与导出记录不一致')
    target = folder/'models'/(key+'.glb')
    target.parent.mkdir(exist_ok=True)
    partial = target.with_suffix('.part')
    try:
        shutil.copyfile(source, partial)
        check_glb(partial)
        if sha(partial) != expected:
            raise ValueError('原件与任务的文件哈希不一致')
        partial.replace(target)
    finally:
        partial.unlink(missing_ok=True)
    job.update(file=str(target.relative_to(folder)), sha256=expected, status='ready')


def import_web(folder, state, key, supplied_file):
    job = state['jobs'][key]
    if job['route'] != 'web' or job['status'] not in ('submitted', 'ready') or not job.get('task_id'):
        raise ValueError('请先登记对应的官网任务')
    original, receipt = website_export(folder, job['task_id'])
    if receipt['reference_sha256'] not in (None, job['input']):
        raise ValueError('官网导出记录与本次任务参考图不一致')
    import_original(folder, key, job, supplied_file or original, receipt['sha256'])
    job['export'] = dict(receipt, reference_sha256=job['input'])


def catalog():
    data = read(APP/'dist/holiday-assets/catalog.json')
    return data if isinstance(data, list) else data['assets']


def verified_archive(job):
    """Older --source and --catalog-id records used the same schema."""
    if job['route'] != 'archive':
        return True
    receipt = job.get('export')
    if receipt:
        return (receipt.get('task') == job['task_id'] and receipt.get('sha256') == job['sha256']
                and receipt.get('method') == 'hi3d-workspace-download')
    for entry in catalog():
        model = entry.get('model') or {}
        if (model.get('page') == job.get('source') and model.get('sha256') == job['sha256']
                and model.get('taskId') == job['task_id']):
            return True
    return False


def reuse(folder, state, args):
    if args.catalog_id:
        model = next((e.get('model') for e in catalog() if e['id'] == args.catalog_id), None) or {}
        if not args.file or not model.get('sha256'):
            raise ValueError('历史目录需要提供已登记的原件')
        source = model['page']
        task = task_id_from_page(source, historical=True)
        if model.get('taskId') and task != model['taskId']:
            raise ValueError('归档任务与模型页不一致')
        original, digest, receipt = args.file, model['sha256'], None
    else:
        task = args.task or task_id_from_page(args.source)
        original, receipt = website_export(folder, task)
        digest = receipt['sha256']
        source = 'https://www.hi3d.ai/3d-model/' + task
    key = job_key(state, args.role)
    job = state['jobs'].get(key)
    if job and job.get('task_id') != task:
        raise ValueError('这个版本已关联另一个任务或预留')
    if job and job['route'] == 'web':
        return import_web(folder, state, key, args.file)
    if job is None:
        job = dict(role=args.role, route='archive', credits=0, input=model_input(state, args.role),
                   task_id=task, source=source)
    import_original(folder, key, job, args.file or original, digest)
    if receipt:
        job['export'] = receipt
    elif args.catalog_id:
        job['catalog_id'] = args.catalog_id
    state['jobs'][key] = job
