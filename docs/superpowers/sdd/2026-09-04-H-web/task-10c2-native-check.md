# H10c2 native recovery check

Synthetic local evidence only,2026-09-06. Actual Buyer/React StrictMode, H9 storage,
H10c1 owner, H10b3 bounded readers and production CORS policy; simulated hub data.
Separately, the focused actual Start SSR route test proved passive route serving.
This fixture is not production Start hydration, an actual paid job, a real wallet,
model call or independent chain verification. Fixture capability literals are
public synthetic test data, not owner material.

Six fresh owned runtimes were used serially. First passed the passive reload
case, then native input timed out on a hidden tab. Second activated only the owned
tab, reached10 cases and reproduced the real forget-scope failure. Third passed16
cases after the fix. Fourth passed2 cases before an immediate scroll measurement
raced Chromium's native scroll. Fifth waited for observable End/Home positions
within2 seconds and passed all16 cases on the typed/keyboard-focusable UI.
The sole full Vitest gate then found a preserved CSS-prefix violation. Only the
new buyer CSS block moved to the end; the affected tests passed, and the sixth
fresh native run passed all16 cases again on the final stylesheet. No full
Vitest sweep was repeated.
No full gate was run during any browser check. A harness stderr update suggestion
was ignored; it was not an instruction to modify the installed tool.

Final totals:8 explicit result reads,1 tree read,9 actual preflights,0 payment POSTs,
0 wallet calls. Selection, storage notification and unmount cancelled held reads.
No capability reached a web request header/URL or rendered DOM; no cookie,
Authorization or Referer was forwarded. The actual local failed write counter
incremented once; successful removal reduced2 rows to1, and malformed-key removal
preserved an unrelated storage entry. Malformed/denied/empty states are distinct.

Parent read all four final list/result screenshots at1280px light and390px dark.
Full origin/ID/accepted price and focus outline were readable without horizontal
page overflow. Full JSON remained escaped text; Tab focused it and native End/Home
scrolled its mobile-width region. This does not claim touch or screen-reader QA.

The supervisor retained bounded output,180s fixture TTL,220s whole-run limit,
parent watches and exact child ownership. All30 recorded process IDs are absent,
all18 recorded ports return ECONNREFUSED and no owned profile/runtime process
remains. Services existed only during these local runs and stopped after cleanup.
No shared browser, owner key, live funds, remote browser bill or production state.

## Retained final artifact hashes

Private runtime locations are intentionally omitted; hashes identify retained
local files, not live URLs or public hosting. No screenshot was modified.

```text
495e1b4652afbeb94d9b06d16a04a4321c5295a407600cf5af49d450b0213e70  check.stdout.log
c91cb20c4e774d969e7388cd092ce119172121e6827d2f1386fd92ef6a41c00a  check.stderr.log
50876e331f30511a12313c833df96e58d803502fc2b214a7336007e0bff6064c  check-result.json
065d93b00627c496deec4c3af2d0100a8e0635df211aa8efe48c41d46cb64414  ready.json
89b9ee9a3a46e2bb46dfc24b7b990ac54180ce5b83516f3f62d4ea32ea8544a5  cleanup.json
53acdd60361140cd0e42cfd3700040e04d8899d6c3ccd4bb6f7d530514dfbd1f  check.py
e41c5736660aa0877d66777f56044d27ee68a43b626e24640c854ae2d4b49902  supervise.ts
707f78e18cf3b1babf8265264c40232b824fea700a459816bd57f3fad5fab114  shots/1280-light-list.png
6b22c7e7c83816f9144112ca8970e7db9fc19a9fe3ee48c06f582b855f06a35b  shots/1280-light-result.png
6ec736b6a39668829cb68d68045162a8a594d8b09b34285260cada8dc4165385  shots/390-dark-list.png
31dbd922354a0e46fc72fcbdf96d98687d3f1f7d0763c5574056a7392ddb814c  shots/390-dark-result.png
```

## Final interaction script (trailing blank lines omitted)

Historical test script, not a payment or deployment command. It is supplied to
an explicitly provisioned owned browser-harness daemon by the supervisor. Its
origin and screenshot directory are injected as task-specific environment values.
The committed buyer-browser fixtures define the synthetic controls used below.

```python
import json,time,os
observations=[]
def evaluate(expression):
  result=cdp('Runtime.evaluate',expression=expression,returnByValue=True,awaitPromise=True,_response_timeout=8)
  assert 'exceptionDetails' not in result, result.get('exceptionDetails')
  return result['result'].get('value')
origin=os.environ['ARCADE_CONFIRM_ORIGIN']
new_tab(origin+'/buyer')
assert wait_for_load(timeout=7)
activate_tab(current_tab())

def until(expression,seconds=8):
  deadline=time.monotonic()+seconds
  while not evaluate(expression):
    assert time.monotonic()<deadline, (expression,evaluate("JSON.stringify({errors:window.__fixtureErrors,body:document.body.innerText.slice(0,1200)})"))
    time.sleep(.05)
until("typeof window.__buyerFixture==='object'")
def read(): return evaluate("window.__buyerFixture.read()")
def stats(): return evaluate("fetch('/fixture-stats').then(r=>r.json())")
def target(role,name,prefix=False):
  nodes=cdp('Accessibility.getFullAXTree',_response_timeout=5)['nodes']
  node=next(n for n in nodes if n.get('role',{}).get('value')==role and
    (n.get('name',{}).get('value','').startswith(name) if prefix else n.get('name',{}).get('value')==name))
  cdp('DOM.scrollIntoViewIfNeeded',backendNodeId=node['backendDOMNodeId'],_response_timeout=5)
  box=cdp('DOM.getBoxModel',backendNodeId=node['backendDOMNodeId'],_response_timeout=5)['model']['content']
  return (sum(box[0::2])/4,sum(box[1::2])/4)
def mouse(kind,p):
  if kind=='mousePressed': cdp('Input.dispatchMouseEvent',type='mouseMoved',x=p[0],y=p[1],_response_timeout=5)
  cdp('Input.dispatchMouseEvent',type=kind,x=p[0],y=p[1],button='left',buttons=1 if kind=='mousePressed' else 0,clickCount=1,_response_timeout=5)
def click(p): mouse('mousePressed',p); mouse('mouseReleased',p)

def mode(value):
  evaluate("fetch('/fixture-control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:"+json.dumps(value)+"})}).then(r=>{if(!r.ok)throw Error('control')})")
def reset(value='ready'):
  evaluate("window.__buyerFixture.reset("+json.dumps(value)+")")
  until("document.body.innerText.includes("+json.dumps('Saved access is unreadable' if value=='invalid' else 'Browser storage is unavailable' if value=='unavailable' else 'No saved jobs' if value=='empty' else 'diff-triage')+")")
def choose(name='diff-triage'): click(target('button',name,True))
def action(name): click(target('button',name))
def note(name):
  r=read();s=stats()
  assert r['walletCalls']==0 and not r['capabilityInDom'] and r['unrelatedPreserved']
  assert s['posts']==0 and not s['capabilityAtWeb'] and not s['leakedUrl'] and not s['ambientHeaders']
  observations.append({'case':name,'browser':r,'hub':s});print(json.dumps(observations[-1]),flush=True)
reset()
assert stats()['reads']==0 and stats()['trees']==0
cdp('Page.reload',_response_timeout=5);assert wait_for_load(timeout=7)
until("document.querySelectorAll('button.buyer-job').length===2")
assert stats()['reads']==0
note('hydration and native reload preserve saved access without network reads')
choose()
assert stats()['reads']==0
press_key('Tab');press_key('Tab')
assert evaluate("document.activeElement.textContent==='Read result'")
press_key('Enter')
until("document.body.textContent.includes('RECOVERED_FIXTURE_RESULT')")
assert stats()['reads']==1 and stats()['preflights']>=1
assert not evaluate("document.querySelector('img[src=x]')!==null")
click(target('DisclosureTriangle','Complete result JSON — untrusted seller content'))
press_key('Tab')
assert evaluate("document.activeElement.matches('.buyer-output')")
note('native keyboard result read with actual CORS and escaped complete output')
for width,height,scheme in [(1280,1000,'light'),(390,844,'dark')]:
  cdp('Emulation.setDeviceMetricsOverride',width=width,height=height,mobile=False,deviceScaleFactor=1,_response_timeout=5)
  cdp('Emulation.setEmulatedMedia',features=[{'name':'prefers-color-scheme','value':scheme}],_response_timeout=5)
  time.sleep(.1)
  assert read()['width']==width and read()['documentWidth']<=width
  target('heading','What this browser can recover.')
  capture_screenshot(os.environ['ARCADE_CONFIRM_SHOTS']+'/'+str(width)+'-'+scheme+'-list.png',max_dim=1500)
  target('region','Complete result JSON')
  if width==390:
    click(target('region','Complete result JSON'))
    press_key('End')
    until("document.querySelector('.buyer-output').scrollTop>0",2)
    press_key('Home')
    until("document.querySelector('.buyer-output').scrollTop===0",2)
  capture_screenshot(os.environ['ARCADE_CONFIRM_SHOTS']+'/'+str(width)+'-'+scheme+'-result.png',max_dim=1500)
cdp('Emulation.setDeviceMetricsOverride',width=1280,height=1000,mobile=False,deviceScaleFactor=1,_response_timeout=5)
action('Read receipt tree')
until("document.body.textContent.includes('Incomplete receipt evidence')")
assert stats()['trees']==1
note('explicit receipt tree retains incomplete evidence')
mode('hold');action('Read result')
until("fetch('/fixture-stats').then(r=>r.json()).then(s=>s.held===1)")
choose('flow-check')
until("fetch('/fixture-stats').then(r=>r.json()).then(s=>s.held===0)")
mode('normal')
assert not evaluate("document.body.textContent.includes('RECOVERED_FIXTURE_RESULT')")
note('selection replacement cancels old read and clears result/tree')
mode('pending');action('Read result')
until("document.body.innerText.includes('Hub still reports pending')")
before=stats()['reads'];time.sleep(.25);assert stats()['reads']==before
note('pending remains distinct without polling')
for value in ['fail','bad-price']:
  mode(value);action('Read result');until("document.body.innerText.includes('Result unavailable')")
  assert not evaluate("document.body.textContent.includes('PRIVATE_FIXTURE_DIAGNOSTIC')")
  note(value+' produces fixed unavailable state')
mode('gateway');action('Read result')
until("document.body.innerText.includes('not a mined transaction')")
assert not evaluate("document.querySelector('.buyer-recovery a[href*=\"/tx/\"]')!==null")
note('Gateway UUID does not become transaction link')
# Replacing storage cancels a read and clears selection without another GET.
mode('hold');action('Read result');until("fetch('/fixture-stats').then(r=>r.json()).then(s=>s.held===1)")
evaluate("window.__buyerFixture.storageChanged()")
until("document.querySelector('.buyer-recovery')===null")
until("fetch('/fixture-stats').then(r=>r.json()).then(s=>s.held===0)")
note('cross-tab storage notification clears current authority')
mode('normal');choose()
click(target('DisclosureTriangle','Forget this saved access…'))
evaluate("window.__buyerFixture.failWrites(true)")
action('Forget this job on this browser')
until("document.body.innerText.includes('Saved access could not be removed')")
assert read()['count']==2 and read()['blockedWrites']==1
note('failed local removal is reported and access retained')
evaluate("window.__buyerFixture.failWrites(false)");choose()
click(target('DisclosureTriangle','Forget this saved access…'))
action('Forget this job on this browser')
until("window.__buyerFixture.read().count===1")
assert not evaluate("document.querySelector('.buyer-recovery')!==null")
note('successful forget removes only selected ordinary row')
reset('invalid');note('malformed saved data is not silently repaired or empty')
click(target('DisclosureTriangle','Forget all saved ordinary access…'))
action('Forget all saved access on this browser')
until("document.body.innerText.includes('No saved jobs')")
assert read()['count']==0
note('explicit malformed-key removal preserves unrelated site data')
reset('unavailable');note('denied storage is not represented as empty')
reset('empty');note('genuine empty store has its own state')
reset();choose();mode('hold');action('Read result')
until("fetch('/fixture-stats').then(r=>r.json()).then(s=>s.held===1)")
evaluate("window.__buyerFixture.unmount()")
until("fetch('/fixture-stats').then(r=>r.json()).then(s=>s.held===0)")
note('unmount cleans up the active read')
print(json.dumps({'nativeComplete':len(observations),'proof':'synthetic recovery only'}),flush=True)
```
