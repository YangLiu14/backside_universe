"""Single explicit Tripo request; preserves logs and refuses duplicate submission."""
import json,os,subprocess,sys
from pathlib import Path
slug=sys.argv[1];dry='--dry-run' in sys.argv
root=Path(__file__).resolve().parents[1]
spec=json.loads((root/'scripts/bookroom-assets.json').read_text())
out=root/'evidence/holiday-assets-v1/laptop/bookroom'/slug
out.mkdir(parents=True,exist_ok=True)
args=['npx','--yes','--package','tripo-cli@0.11.2','tripo','make',spec[slug],
      '--model','tripo-v3.1','-p','texture_quality=detailed','-p','pbr=true',
      '--name','bookroom-'+slug,'--out',str(out),'--no-open','--json']
if dry:args.append('--dry-run')
else:
    plan=json.loads((out/'plan.json').read_text())
    if not plan.get('valid') or plan.get('warnings'):raise SystemExit('Resolve plan first')
    with (out/'submitted.json').open('x') as f:json.dump({'args':args},f,indent=2)
env=dict(os.environ,TRIPO_ANALYTICS_ENABLED='0')
with (out/('plan.json' if dry else 'result.json')).open('w') as stdout,(out/('plan.log' if dry else 'generation.log')).open('w') as stderr:
    result=subprocess.run(args,stdout=stdout,stderr=stderr,env=env)
print(slug,'dry' if dry else 'generation','exit',result.returncode)
if dry:print((out/'plan.json').read_text())
sys.exit(result.returncode)
