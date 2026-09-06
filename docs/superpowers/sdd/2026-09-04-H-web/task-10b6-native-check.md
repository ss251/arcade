> Sanitized historical execution artifact. Statements reflect their recorded checkpoint and may be superseded. Historical commands are not current instructions. See the [current runbook](../../../runbook.md) for current behavior, approvals and operator commands. Personal/runtime locations and private artifact links may be redacted; public evidence and test distinctions are preserved.

# H10b6 native check — historical execution artifact

The loopback fixture source is in apps/web/test/fixtures/chat-purchase-browser.tsx
and chat-purchase-browser-server.ts. The root's bounded supervisor launched that
server, an isolated installed Chrome-for-Testing with two renderers, a private
browser-harness daemon/profile/runtime and the check below. Empty environment,
loopback-only DNS/CSP, no recordings/telemetry/updates; owned parent/TTL guards
and unconditional reaping. The server's own180-second fuse bounds orphaning.
No daemon/service is running after the documented cleanup.

This is actual executed browser-harness Python/CDP logic, not a generic browser
script or a claim that fixture receipts were live. ARCADE_CONFIRM_ORIGIN and
ARCADE_CONFIRM_SHOTS were assigned only to newly owned loopback/runtime targets
by the supervisor. Do not point this fixture at a real wallet or fund its public
repeated-01 test account. Installed browser-harness supplied the documented
new_tab/CDP/keyboard/screenshot helpers. Personal runtime paths are omitted.

```python
import json,time,os
observations=[]
def evaluate(expression):
  result=cdp('Runtime.evaluate',expression=expression,returnByValue=True,awaitPromise=True,_response_timeout=8)
  assert 'exceptionDetails' not in result, result.get('exceptionDetails')
  return result['result'].get('value')
origin=os.environ['ARCADE_CONFIRM_ORIGIN']
new_tab(origin+'/')
assert wait_for_load(timeout=7)
activate_tab(current_tab())
def until(expression,seconds=8):
  deadline=time.monotonic()+seconds
  while not evaluate(expression):
    assert time.monotonic()<deadline, (expression,evaluate("JSON.stringify({errors:window.__fixtureErrors,body:document.body.innerText.slice(0,1200)})"))
    time.sleep(.05)
until("typeof window.__chatFixture==='object'")
def read(): return evaluate("window.__chatFixture.read()")
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
def send():
  click(target('textbox','Message'))
  cdp('Input.insertText',text='buy the fixture',_response_timeout=5)
  press_key('Enter')
  until("document.querySelector('button.approve:not(.connect):not(:disabled)')!==null")
def reset(mode='normal',rail='eip3009'):
  evaluate("window.__chatFixture.reset("+json.dumps(mode)+","+json.dumps(rail)+")")
  time.sleep(.2)
def hold():
  p=target('button','Hold to approve',True); mouse('mousePressed',p)
  time.sleep(.25)
  assert evaluate("Number(document.querySelector('button.approve')?.style.getPropertyValue('--p'))>0"),'Hold not started'
  time.sleep(.8); mouse('mouseReleased',p)
def note(name):
  r=read(); s=stats()
  assert not r['privateInTranscript'] and not r['capabilityInDom']
  assert not s['privateInModel'] and not s['paymentAtWeb'] and not s['wrongOrigin'] and not s['leakedUrl']
  observations.append({'case':name,'browser':r,'hub':{k:v for k,v in s.items() if k!='events'}})
  print(json.dumps(observations[-1]),flush=True)
  return r,s
# First prove the actual streamed card and layout before any confirmation.
reset(); send()
for width,height,scheme in [(1280,1000,'light'),(390,844,'dark')]:
  cdp('Emulation.setDeviceMetricsOverride',width=width,height=height,mobile=False,deviceScaleFactor=1,_response_timeout=5)
  cdp('Emulation.setEmulatedMedia',features=[{'name':'prefers-color-scheme','value':scheme}],_response_timeout=5)
  time.sleep(.15)
  state=read(); assert state['width']==width and state['documentWidth']<=width
  target('button','Hold to approve',True)
  capture_screenshot(os.environ['ARCADE_CONFIRM_SHOTS']+'/'+str(width)+'-'+scheme+'.png',max_dim=1500)
cdp('Emulation.setDeviceMetricsOverride',width=1280,height=1000,mobile=False,deviceScaleFactor=1,_response_timeout=5)
hold()
until("document.body.textContent.includes('PRIVATE_PAID_RESULT')")
r,s=note('real SDK + native hold + EIP offline recovery + duplicate output chunks')
assert r['methods'].count('eth_signTypedData_v4')==1 and s['paid']==1 and s['recoveries']==1 and s['results']==1
assert 'output-available' in r['toolStates']
assert s['preflights']>=2 and r['storedJobs']==1
assert not evaluate("document.querySelector('img[src=x]')!==null")
evaluate("window.__chatFixture.repaint()"); time.sleep(.2)
assert stats()['paid']==1 and read()['methods'].count('eth_signTypedData_v4')==1
evaluate("window.__chatFixture.restore()"); time.sleep(.3)
r,s=note('restored approved/output transcript is passive')
assert s['paid']==1 and r['methods'].count('eth_signTypedData_v4')==1
assert evaluate("document.body.textContent.includes('unverified transcript')")
assert not evaluate("document.querySelector('button.approve')!==null")
# Gateway uses the identical Chat/SDK/gesture boundary, a different shared domain.
reset(rail='gateway'); send(); hold()
until("document.body.textContent.includes('not a mined transaction')")
r,s=note('Gateway domain offline recovery and qualified UUID without explorer')
assert r['methods'].count('eth_signTypedData_v4')==1 and s['paid']==2 and s['recoveries']==2
assert not evaluate("document.querySelector('.tool-out a')!==null")
# Preliminary SDK output is not a completed readiness signal.
reset('preliminary'); send(); hold()
until("document.body.textContent.includes('This purchase was not started')")
r,s=note('preliminary SDK output cannot authorize a run')
assert r['methods'].count('eth_signTypedData_v4')==0 and s['paid']==2
# Actual SDK output identity mismatch burns before wallet signature.
reset('mismatch'); send(); hold()
until("document.body.textContent.includes('This purchase was not started')")
r,s=note('mismatched SDK readiness cannot authorize')
assert r['methods'].count('eth_signTypedData_v4')==0 and s['paid']==2
reset(); send(); click(target('button','no'))
until("document.body.textContent.includes('Purchase declined in this conversation')")
r,s=note('native denial has no signing entry')
assert r['methods'].count('eth_signTypedData_v4')==0 and s['paid']==2
# Reopening a pending approval must not silently provide a new card or read wallet.
reset(); send()
before=read()['methods']; evaluate("window.__chatFixture.restore()"); time.sleep(.3)
r,s=note('restored unanswered request is retired')
assert r['methods']==before and not evaluate("document.querySelector('button.approve')!==null")
# Wallet event change cancels an already-running real hold.
reset(); send()
p=target('button','Hold to approve',True); mouse('mousePressed',p); time.sleep(.25)
assert evaluate("Number(document.querySelector('button.approve')?.style.getPropertyValue('--p'))>0")
evaluate("window.__chatFixture.changeChain()"); time.sleep(.85); mouse('mouseReleased',p)
r,s=note('wallet chain event cancels live hold')
assert r['methods'].count('eth_signTypedData_v4')==0 and s['paid']==2
# SDK transport failure drops approved-but-not-run authority with fixed error UI.
reset('sdk-error'); send(); hold()
until("document.body.textContent.includes('The chat request did not complete')")
r,s=note('failed SDK request burns pending authority')
assert r['methods'].count('eth_signTypedData_v4')==0 and s['paid']==2
assert not evaluate("document.body.textContent.includes('PRIVATE_FIXTURE_DIAGNOSTIC')")
# Close during the actual fixture wallet's pending signature, then resolve it late.
reset('hold-signature'); send(); hold()
until("window.__chatFixture.read().methods.includes('eth_signTypedData_v4')")
evaluate("window.__chatFixture.unmount()"); evaluate("window.__chatFixture.release()"); time.sleep(.5)
r,s=note('unmount aborts continuation even when a late wallet signature exists')
assert s['paid']==2 and r['listenerCount']==0
assert r['methods'].count('eth_signTypedData_v4')==1
print(json.dumps({'nativeComplete':len(observations),'receiptProof':'simulated only','events':s['events']}),flush=True)
```
