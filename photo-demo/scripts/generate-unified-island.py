"""Submit one reviewed Tripo terrain job; refuse duplicate paid submissions."""
import json,os,subprocess
from pathlib import Path

root=Path(__file__).resolve().parents[1]
out=root/'evidence/holiday-assets-v1/laptop/spatial-v6'
plan=json.loads((out/'unified-plan.json').read_text())
if not plan.get('valid') or plan.get('warnings') or plan.get('errors'):
    raise SystemExit('Resolve the generation plan before submitting')
args=['npx','--yes','--package','tripo-cli@0.11.2','tripo','make',str(out/'unified-reference.png'),
      '--model','tripo-v3.1','-p','geometry_quality=detailed','-p','texture_quality=detailed','-p','pbr=true',
      '--name','unified-grotto-bookhouse-harbor','--out',str(out/'unified'),'--no-open','--json']
with (out/'unified-submitted.json').open('x') as f:
    json.dump({'args':args,'estimate':plan['generation_credits_estimate']},f,indent=2)
with (out/'unified-result.json').open('w') as stdout,(out/'unified-generation.log').open('w') as stderr:
    result=subprocess.run(args,stdout=stdout,stderr=stderr,env=dict(os.environ,TRIPO_ANALYTICS_ENABLED='0'))
print('Unified generation exit:',result.returncode)
raise SystemExit(result.returncode)
