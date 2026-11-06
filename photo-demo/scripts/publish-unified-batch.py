"""Publish reviewed whole-island variants without replacing the ordinary assets."""
import hashlib
import json
import math
import shutil
from pathlib import Path

root = Path(__file__).resolve().parents[1]
evidence = root / 'evidence/holiday-assets-v1'
web = root / 'dist/holiday-assets'
items = {
    'blue-book': (-math.pi/2, '白崖、石阶、小屋与瞭望亭整体生成；海蚀拱目前为封底凹洞，贯通洞口待精修。'),
    'orange-book': (0, '赤岩峡谷、跨谷木桥与嵌崖旅舍整体生成；远景有所简化，书封文字不作为原照识别结果。'),
    'phone': (0, '潮池、浴屋、船棚与栈道整体生成；保留三摄辨识，镜头及机壳的精确形状仍需校准。'),
}
records = {}
for asset_id, (yaw, review) in items.items():
    folder = evidence / asset_id / 'unified-v2'
    report = json.loads((folder/'inspection/mesh-report.json').read_text())
    submission = json.loads((folder/'studio-submission.json').read_text())
    model_path = web/'assets'/asset_id/'model-unified-v2.glb'
    if not model_path.is_file():
        raise FileNotFoundError(model_path)
    source = folder/'source.glb'
    if hashlib.sha256(source.read_bytes()).hexdigest() != report['sha256']:
        raise ValueError(f'{asset_id} source changed since inspection')
    shutil.copy2(folder/'reference.png', web/'assets'/asset_id/'unified-reference-v2.png')
    model = {
        'file': f'assets/{asset_id}/model-unified-v2.glb',
        'page': 'https://studio.tripo3d.ai/zh/workspace/generate/'+submission['taskId'],
        'taskId': submission['taskId'], 'provider': 'Tripo Studio', 'yaw': yaw,
        'triangles': report['triangles'], 'bytes': model_path.stat().st_size,
        'sha256': hashlib.sha256(model_path.read_bytes()).hexdigest(),
        'sourceSHA256': report['sha256'], 'derivative': True, 'meshDecimated': False,
    }
    records[asset_id] = {'model':model,'note':review}
    manifest = {
        'asset':asset_id,'version':'unified-v2','state':'expanded-holiday-exterior',
        'generation':submission,'source':report,'webModel':model,
        'geometryModification':'none; web compression only; no nonuniform scaling',
        'ordinaryAssetPreserved':True,'separateLandscapePartsAssembled':False,
        'doorInteraction':False,'animatedWater':False,'mainDesktopIntegrated':True,
        'review':review,'reviewStatus':'first whole-island model; detail refinement remains',
    }
    submission.update(status='completed-and-downloaded',sourceFile='source.glb')
    (folder/'studio-submission.json').write_text(json.dumps(submission,ensure_ascii=False,indent=2)+'\n')
    manifest['generation']=submission
    (folder/'scene-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')

for path in [web/'catalog.json', evidence/'catalog-state.json']:
    catalog = json.loads(path.read_text())
    for asset in catalog:
        asset_id=asset['id']
        if asset_id not in records: continue
        record=records[asset_id]
        asset['expandedModel']=record['model']
        asset['expandedReference']=f'assets/{asset_id}/unified-reference-v2.png'
        asset.setdefault('previousBack', asset.get('back'))
        asset.setdefault('previousBackTask', asset.get('backTask'))
        asset['back']=asset['expandedReference']
        asset['backTask']=None
        asset['backProvider']='imagegen'
        asset['backCaption']='新版整体构图 · AI 建模参考'
        asset['study']=f'islands-unified.html#{asset_id}'
        asset['studyLabel']='查看新版背面展开态 →'
        asset['reviewStatus']='新版整体景观已生成'
        asset['reviewNote']=record['note']+' 新版展开态已接入主桌面，原物件与旧版薄边模型保留作对照。'
    path.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:{'triangles':v['model']['triangles'],'bytes':v['model']['bytes']} for k,v in records.items()},indent=2))
