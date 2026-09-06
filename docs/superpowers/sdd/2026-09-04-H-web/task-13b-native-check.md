# H13b native browser check

2026-09-06. Root-only under the machine-load restriction; no independent review.
Actual Chat/useChat/SDK framing, Confirm gesture, private approval, keyless quote
route, CORS and direct transport, with a public offline signer and synthetic
model/hub/receipts. This is **not** a funded wallet, live model, ENS/RPC or
chain-payment proof. Gateway transfer UUIDs are not mined transactions.

## Cases and visual corrections

Two finite 11-case runs passed behavior: original ENS name plus resolved id on
the real card; one offline EIP signature and one simulated POST despite duplicate
SDK chunks; restored history inert; the equivalent offline Gateway path;
typed expiry and mismatch with zero wallet methods; wrong resolved-id readiness
burned; expiry after readiness before signing; expiry during a held offline
signature with no forwarding; injected late quote after conversation replacement
cannot repaint; and unmount removes listeners.

Run 1's five screenshots exposed clipped mismatch addresses and a misleading
ceiling displayed like a quoted price with empty payment facts. Those images
are **not visual acceptance**. A separate refusal view now says “Proposed
ceiling … No verified quote.” and wraps the full validated public addresses.
Run 2 passed all 11 cases plus those assertions. Five images were inspected.
The refusal button was then given a scoped 44px minimum hit area. Final Run 3
checked only the two affected refusal states and native decline: both passed
with zero wallet methods, signatures, stored jobs or paid submissions. Two final
images were inspected. The other three accepted frames are from Run 2; final
CSS only targets the refusal paragraph and immediately following deny button.

Run 2 totals: 9 SDK fixture calls, 2 simulated paid POSTs, 2 signer recoveries,
2 results, 3 offline signatures (one not forwarded), 24 unsigned quotes,
52 name reads and 4 real browser CORS preflights. No private paid result in the
model input/transcript, capability in DOM, payment header at the web origin,
wrong origin, leaked URL, reflected provider diagnostic or browser error was
observed. Run 3 had two blocked SDK calls and two unsigned quotes, no payment.

The late-delivery wrapper deliberately lets actual HTTP complete while holding
its delivery and ignoring the client AbortSignal underneath. This proves stale
UI ownership is rejected, **not** server cancellation. The narrow 390px captures
are desktop Chrome, not phone/touch/screen-reader testing or production hydration.

Each run used a fresh owned directory/profile, isolated environment, installed
Chrome for Testing (max2 renderers) and loopback-only network policy. The finite
supervisor reaped fixture, Chrome, harness and check. Independent final cleanup
proved 15 exact PIDs absent, 9 former ports ECONNREFUSED and zero owned profile/
runtime processes. The URLs served only during these runs and stopped afterward.
No harness upgrade, install, shared browser/profile, real key or owner config use.

## Runtime fingerprints

Original runtime paths are deliberately omitted. Screenshots are retained
privately, not committed. Each numbered set preserves its own failed/final status.

### Run 1

```text
e7237149ceb9c22d96ba00990371d0ef188817ed2b591ac46114cc0ff97954b7  check.py
bffb3cda0e1003b0592356cba4b5ac94a9b43b96f7e7b6fb4dbd36415b6ef423  supervisor.ts
a4fcec70b7355d54f26ce1f8b3947f895cba4d7ae46b4cbacb7d1ff04d7b678d  check.stdout.log
4796700ee2555b449bab21f3cbba277b5d12cb4f82757fb154733163b32b11fe  cleanup.json
3528c0af348fe6849ab12adb79008396c52f44515a487c34803a2e60c37433d5  shots/1280-light-name.png
8dff4577206a82a91eced00913f10e52c9c01b76234981b77cf8d46c86d7391d  shots/390-dark-name-mismatch.png
808817c3fc63532d5507d0f328aecfe9cedd2b19d56dda0d5a14a15218cce09f  shots/1280-light-unconfirmed.png
b0588c5d7da01b54868e030b2638f38e4e7ac576630d5ff8402e766b9349bc40  shots/390-dark-name-expired.png
05abc94b85346f7fa87da0c72da02a74c79d7d9758fdfa9aae7c0305ed0b4348  shots/390-dark-name.png
```

### Run 2

```text
f7873fe9cd61d77163303ad47d33f4ebfb1f43238f93774b775b062b04afcafd  check.py
5ff3863392b00253026d7ed2140610d573a7d62cf2514f28e8fbae2afc82b55c  supervisor.ts
c42e9b1bd1e3a81529db64eddc4cae71dfd930a8953754043ce9173d782346b5  check.stdout.log
1aea11004f2c72202dcb611dffeb1f55d556336d144b3576d5dcc34e0de13a3f  cleanup.json
3528c0af348fe6849ab12adb79008396c52f44515a487c34803a2e60c37433d5  shots/1280-light-name.png
ad99af3811f49e56109a30c1b812ff28d0a502f76183aa752f6aa5937c4c509e  shots/390-dark-name-mismatch.png
808817c3fc63532d5507d0f328aecfe9cedd2b19d56dda0d5a14a15218cce09f  shots/1280-light-unconfirmed.png
a87745fdb9b7738954e8d477b8cf45361da625838b65d727f35a3f8bde122475  shots/390-dark-name-expired.png
05abc94b85346f7fa87da0c72da02a74c79d7d9758fdfa9aae7c0305ed0b4348  shots/390-dark-name.png
```

### Run 3

```text
7f57528cbc87f69d87f34b7252f16cd6966b57292cc2df3ca4663e80b28ad68d  check.py
b509c7bfb06bdcaacd3aa166b3fed693ad596735750401c3f6169df465624917  supervisor.ts
faf62b5c920ca8aa58dc292d158e4678770a1d5e1ea8302f623d78928114ba1b  check.stdout.log
588793ab1b6e65381e7b04b9e3c779db84547f71d08ded3da7724d14227a14d0  cleanup.json
1549b78f9add780ae71337c3f12101fb0452186cf846bc427fe0413ef2e57ba2  shots/390-dark-name-mismatch.png
619784927ffaf4b16b9b0e873f4f50ff34b851cd227eeaa8350dd08f1c69986f  shots/390-dark-name-expired.png
```

## Run 2 native check source

```python
import json,time,os
observations=[]
def evaluate(expression):
  result=cdp('Runtime.evaluate',expression=expression,returnByValue=True,awaitPromise=True,_response_timeout=8)
  assert 'exceptionDetails' not in result,result.get('exceptionDetails')
  return result['result'].get('value')
origin=os.environ['ARCADE_CONFIRM_ORIGIN']
new_tab(origin+'/')
assert wait_for_load(timeout=7)
if evaluate("document.visibilityState")!='visible':
  activate_tab(current_tab())
def until(expression,seconds=8):
  deadline=time.monotonic()+seconds
  while not evaluate(expression):
    assert time.monotonic()<deadline,(expression,evaluate("JSON.stringify({errors:window.__fixtureErrors,body:document.body.innerText.slice(0,1200)})"))
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
  return(sum(box[0::2])/4,sum(box[1::2])/4)
def mouse(kind,p):
  if kind=='mousePressed': cdp('Input.dispatchMouseEvent',type='mouseMoved',x=p[0],y=p[1],_response_timeout=5)
  cdp('Input.dispatchMouseEvent',type=kind,x=p[0],y=p[1],button='left',buttons=1 if kind=='mousePressed' else 0,clickCount=1,_response_timeout=5)
def click(p): mouse('mousePressed',p);mouse('mouseReleased',p)
def send(ready=True):
  click(target('textbox','Message'))
  cdp('Input.insertText',text='hire diff-triage.seller.arcade.eth',_response_timeout=5)
  press_key('Enter')
  if ready: until("document.querySelector('button.approve:not(.connect):not(:disabled)')!==null")
def reset(mode='name-normal',rail='eip3009'):
  evaluate("window.__chatFixture.reset("+json.dumps(mode)+","+json.dumps(rail)+")")
  time.sleep(.15)
def control(mode):
  assert evaluate("fetch('/fixture-control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:"+json.dumps(mode)+",rail:'eip3009'})}).then(r=>r.ok)")
def hold():
  p=target('button','Hold to approve',True);mouse('mousePressed',p)
  time.sleep(.25)
  assert evaluate("Number(document.querySelector('button.approve')?.style.getPropertyValue('--p'))>0"),'Hold did not start'
  time.sleep(.8);mouse('mouseReleased',p)
def note(name):
  r=read();s=stats()
  assert not r['privateInTranscript'] and not r['capabilityInDom']
  assert not s['privateInModel'] and not s['paymentAtWeb'] and not s['wrongOrigin'] and not s['leakedUrl']
  assert not evaluate("document.body.innerText.includes('PRIVATE_FIXTURE_DIAGNOSTIC')")
  assert not evaluate("window.__fixtureErrors.length")
  observations.append({'case':name,'browser':r,'hub':{k:v for k,v in s.items() if k!='events'}})
  print(json.dumps(observations[-1]),flush=True)
  return r,s
reset();send()
assert evaluate("document.querySelector('.ens-name')?.textContent==='diff-triage.seller.arcade.eth'")
assert evaluate("document.querySelector('.confirm-head .tool-id')?.textContent==='diff-triage'")
for width,height,scheme in [(1280,1000,'light'),(390,844,'dark')]:
  cdp('Emulation.setDeviceMetricsOverride',width=width,height=height,mobile=False,deviceScaleFactor=1,_response_timeout=5)
  cdp('Emulation.setEmulatedMedia',features=[{'name':'prefers-color-scheme','value':scheme}],_response_timeout=5)
  time.sleep(.15)
  assert read()['width']==width and read()['documentWidth']<=width
  target('button','Hold to approve',True)
  capture_screenshot(os.environ['ARCADE_CONFIRM_SHOTS']+'/'+str(width)+'-'+scheme+'-name.png',max_dim=1500)
note('original name and resolved id appear on real SDK-streamed card in desktop light and narrow dark')
hold();until("document.body.textContent.includes('PRIVATE_PAID_RESULT')")
r,s=note('named native hold produces one offline EIP signature and one synthetic direct purchase despite duplicate chunks')
assert r['methods'].count('eth_signTypedData_v4')==1 and s['paid']==1 and s['recoveries']==1
assert not evaluate("document.querySelector('img[src=x]')!==null")
before=read()['methods'];evaluate("window.__chatFixture.restore()")
until("document.body.textContent.includes('unverified transcript')")
assert read()['methods']==before and stats()['paid']==1
note('restored name approval/output cannot reconstruct private authority')
reset(rail='gateway');send();hold()
until("document.body.textContent.includes('not a mined transaction')")
r,s=note('same original-name boundary on offline Gateway domain, explicitly not mined')
assert r['methods'].count('eth_signTypedData_v4')==1 and s['paid']==2 and s['recoveries']==2
for mode,text in [('name-expired','The ENS name has expired.'),('name-mismatch','differs from the payment challenge payTo')]:
  reset(mode);send(False);until("document.body.innerText.includes("+json.dumps(text)+")")
  r,s=note(mode+' displays a typed blocker without querying or signing with the wallet')
  assert not r['methods'] and s['paid']==2
  assert not evaluate("document.querySelector('button.approve:not(:disabled)')!==null")
  assert evaluate("document.body.innerText.includes('requested ENS name')")
  assert not evaluate("document.querySelector('.ens-name')!==null")
  assert read()['documentWidth']<=390
  assert evaluate("document.querySelector('.purchase-refusal').scrollWidth<=document.querySelector('.purchase-refusal').clientWidth")
  assert evaluate("document.body.innerText.includes('Proposed ceiling $0.02. No verified quote.')")
  assert not evaluate("document.querySelector('.price-big')!==null")
  target('button','no')
  capture_screenshot(os.environ['ARCADE_CONFIRM_SHOTS']+'/390-dark-'+mode+'.png',max_dim=1500)
reset('name-output-mismatch');send();hold()
until("document.body.innerText.includes('This purchase was not started')")
r,s=note('different resolved-id readiness burns the original name approval')
assert r['methods'].count('eth_signTypedData_v4')==0 and s['paid']==2
reset('name-expire-after-readiness');send();hold()
until("document.body.innerText.includes('Purchase not started. A fresh confirmation is required.')")
r,s=note('name expiry after SDK readiness prevents the wallet signature')
assert r['methods'].count('eth_signTypedData_v4')==0 and s['paid']==2
reset('name-hold-signature');send();hold()
until("window.__chatFixture.read().methods.includes('eth_signTypedData_v4')")
control('name-expired');evaluate("window.__chatFixture.release()")
until("document.body.innerText.includes('Purchase outcome unconfirmed.')")
r,s=note('name expiry during a pending offline wallet signature prevents forwarding and remains unconfirmed')
assert r['methods'].count('eth_signTypedData_v4')==1 and s['paid']==2
cdp('Emulation.setDeviceMetricsOverride',width=1280,height=1000,mobile=False,deviceScaleFactor=1,_response_timeout=5)
cdp('Emulation.setEmulatedMedia',features=[{'name':'prefers-color-scheme','value':'light'}],_response_timeout=5)
capture_screenshot(os.environ['ARCADE_CONFIRM_SHOTS']+'/1280-light-unconfirmed.png',max_dim=1500)
# Explicit synthetic late-delivery hook: native HTTP finishes, client result is
# held despite its abort. This tests UI ownership, not server-side cancellation.
evaluate("""(()=>{
const native=window.fetch.bind(window);window.__lateQuote={hold:false,held:[]};
window.fetch=(input,init)=>{
 const url=new URL(input instanceof Request?input.url:String(input),location.href);
 if(url.origin===location.origin&&url.pathname==='/api/quote'&&window.__lateQuote.hold)
   return native(input,{...init,signal:undefined}).then(r=>new Promise(resolve=>window.__lateQuote.held.push(()=>resolve(r))));
 return native(input,init);
};})()""")
reset();evaluate("window.__lateQuote.hold=true");send(False)
until("window.__lateQuote.held.length>0")
evaluate("window.__lateQuote.hold=false");reset('name-expired');send(False)
until("document.body.innerText.includes('The ENS name has expired.')")
evaluate("window.__lateQuote.held.splice(0).forEach(release=>release())");time.sleep(.2)
r,s=note('late old-name quote after a new blocked conversation cannot repaint or authorize')
assert not r['methods'] and s['paid']==2 and not evaluate("document.querySelector('button.approve:not(:disabled)')!==null")
evaluate("window.__chatFixture.unmount()");time.sleep(.15)
assert read()['listenerCount']==0 and stats()['paid']==2
note('unmount cleans wallet listeners with no extra signed or paid work')
print(json.dumps({'event':'PASS','cases':len(observations),'scope':'synthetic SDK/model/hub with real components, no live chain or owner keys'}),flush=True)
```

## Final affected-state check source

```python
import json,time,os
observations=[]
def evaluate(expression):
  result=cdp('Runtime.evaluate',expression=expression,returnByValue=True,awaitPromise=True,_response_timeout=8)
  assert 'exceptionDetails' not in result,result.get('exceptionDetails')
  return result['result'].get('value')
origin=os.environ['ARCADE_CONFIRM_ORIGIN']
new_tab(origin+'/')
assert wait_for_load(timeout=7)
if evaluate("document.visibilityState")!='visible':
  activate_tab(current_tab())
def until(expression,seconds=8):
  deadline=time.monotonic()+seconds
  while not evaluate(expression):
    assert time.monotonic()<deadline,(expression,evaluate("JSON.stringify({errors:window.__fixtureErrors,body:document.body.innerText.slice(0,1200)})"))
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
  return(sum(box[0::2])/4,sum(box[1::2])/4)
def mouse(kind,p):
  if kind=='mousePressed': cdp('Input.dispatchMouseEvent',type='mouseMoved',x=p[0],y=p[1],_response_timeout=5)
  cdp('Input.dispatchMouseEvent',type=kind,x=p[0],y=p[1],button='left',buttons=1 if kind=='mousePressed' else 0,clickCount=1,_response_timeout=5)
def click(p): mouse('mousePressed',p);mouse('mouseReleased',p)
def send(ready=True):
  click(target('textbox','Message'))
  cdp('Input.insertText',text='hire diff-triage.seller.arcade.eth',_response_timeout=5)
  press_key('Enter')
  if ready: until("document.querySelector('button.approve:not(.connect):not(:disabled)')!==null")
def reset(mode='name-normal',rail='eip3009'):
  evaluate("window.__chatFixture.reset("+json.dumps(mode)+","+json.dumps(rail)+")")
  time.sleep(.15)
def control(mode):
  assert evaluate("fetch('/fixture-control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:"+json.dumps(mode)+",rail:'eip3009'})}).then(r=>r.ok)")
def hold():
  p=target('button','Hold to approve',True);mouse('mousePressed',p)
  time.sleep(.25)
  assert evaluate("Number(document.querySelector('button.approve')?.style.getPropertyValue('--p'))>0"),'Hold did not start'
  time.sleep(.8);mouse('mouseReleased',p)
def note(name):
  r=read();s=stats()
  assert not r['privateInTranscript'] and not r['capabilityInDom']
  assert not s['privateInModel'] and not s['paymentAtWeb'] and not s['wrongOrigin'] and not s['leakedUrl']
  assert not evaluate("document.body.innerText.includes('PRIVATE_FIXTURE_DIAGNOSTIC')")
  assert not evaluate("window.__fixtureErrors.length")
  observations.append({'case':name,'browser':r,'hub':{k:v for k,v in s.items() if k!='events'}})
  print(json.dumps(observations[-1]),flush=True)
  return r,s
cdp('Emulation.setDeviceMetricsOverride',width=390,height=844,mobile=False,deviceScaleFactor=1,_response_timeout=5)
cdp('Emulation.setEmulatedMedia',features=[{'name':'prefers-color-scheme','value':'dark'}],_response_timeout=5)
for mode,text in [('name-expired','The ENS name has expired.'),('name-mismatch','differs from the payment challenge payTo')]:
  reset(mode);send(False);until("document.body.innerText.includes("+json.dumps(text)+")")
  assert evaluate("document.querySelector('.purchase-refusal').scrollWidth<=document.querySelector('.purchase-refusal').clientWidth")
  assert evaluate("document.body.innerText.includes('Proposed ceiling $0.02. No verified quote.')")
  assert not evaluate("document.querySelector('.price-big')!==null")
  assert not evaluate("document.querySelector('button.approve')!==null")
  assert not read()['methods'] and stats()['paid']==0
  size=evaluate("(()=>{const r=document.querySelector('.purchase-refusal + .deny').getBoundingClientRect();return {width:r.width,height:r.height}})()")
  assert size['width']>=44 and size['height']>=44,size
  p=target('button','no')
  capture_screenshot(os.environ['ARCADE_CONFIRM_SHOTS']+'/390-dark-'+mode+'.png',max_dim=1500)
  click(p);until("document.body.innerText.includes('Purchase declined in this conversation')")
  r,s=note(mode+' wraps full addresses, labels only the ceiling, and native 44px decline has no wallet or payment IO')
  assert not r['methods'] and s['paid']==0
evaluate("window.__chatFixture.unmount()");time.sleep(.15)
assert read()['listenerCount']==0
print(json.dumps({'event':'PASS','cases':len(observations),'scope':'final refusal rendering and native decline only, no signatures or purchases'}),flush=True)
```
