# H11 actual seller route — native verification

2026-09-06, root-only. Final owned run `arcade-h11-native-gqXwc8`:
16 cases passed; check exit0. Real Start SSR/client hydration and actual H2→H4
synthetic summaries, native CDP mouse/keyboard, synthetic EIP-1193 account provider.
No real wallet/key, signing, chain switch, payment, model or production endpoint.
These loopback URLs served only during their owned run and stopped after cleanup.

## What was observed

Missing-address SSR/hydration made zero hub/account requests. Native invalid input
made zero summary reads. Public selection fetched exactly one summary, updated
the URL, and survived bookmark reload with no wallet prompt. Complete, unknown
cost, unknown direct-spend, negative, zero, historical-only, empty, failed and
wrong-seller responses retained their meanings. Unknown totals were not zero and
failed reads did not become empty ledgers. Agent #0 and unknown ENS expiry stayed
qualified; public hashes had no guessed transaction links or raw diagnostics.

One explicit successful wallet action requested only eth_requestAccounts. Rejected
and malformed accounts showed a fixed public-address fallback. A fourth held
account request was cancelled by manual typing/selection; later completion could
not replace that selection or restore old totals. No signature, chain-switch or
payment method was invoked. This proves synthetic-provider lifecycle, not any
particular installed wallet. Separate pure tests cover abort and 15-second timeout.

All four final screenshots were read:1280px light totals/references and390px dark
totals/references. Full summary addresses and open references wrap without page
horizontal overflow; native single-line address input remains editable/scrollable.
The future pay-test text reflects the fixture timestamp rather than fabricated
freshness. Native form/Enter/visible controls are exercised; no actual touch or
screen-reader acceptance is claimed.

## Failed attempts and cleanup

- iQ8Pub: stopped after passive markup observation; form interaction ran before
  client hydration was established. This is not a hydration pass.
- PEmxQU: generated Python syntax failed before a case. Replacement-string dollar
  expansion was corrected; syntax is now checked before launching the browser.
- 8QkjCe: confirmed hydration and invalid-input behavior, then the driver failed
  to replace input text. Explicit native Select All plus value checking fixed the
  driver, without changing seller behavior.
- gqXwc8: final16 cases passed. All four serial supervisors ended and reaped their
  owned children. Independent check:20 exact PIDs absent,9 distinct ports returned
  ECONNREFUSED (the web port was reused serially),0 owned profile/runtime processes.
  No full gate ran concurrently. No shared app process was stopped.

The supervisor bounds life to220s/check160s, watches its parent, captures at most
64KiB per child stream and owns its fixture, two-renderer Chromium, browser-harness
daemon and check. Fresh0700 temp directory/profile/runtime each attempt; empty
inherited environment, loopback-only fixture fetch fence and Chrome DNS exclusions.
Private runtime artifacts remain local; fingerprints identify the final originals.

```text
099f7a86f0feb173899180769ab380b75c32a23e95d6da675f9aa14195145499  check.stdout.log
c91cb20c4e774d969e7388cd092ce119172121e6827d2f1386fd92ef6a41c00a  check.stderr.log
665d1a7c35a051fa93f6c886d97295c984c1fa8c130c6e24e504ee64d0da92a1  check-result.json
7bdb1173b0624f402b64e5f940cad21c3a44a9f56b2ff6916648c585a3a77f42  ready.json
0a0edd3924050b342ce7ac094a37bc37bb9cecf8257edce5f799cf6244a461c5  cleanup.json
40ffdbe796114960d34c8e7ae7c224f3397088df8664df16379afdb325fd201e  check.py
86451f2d3de8244036880cf716efa191fec87273be81828a928676f39c0b4ebd  supervise.ts
fa887a52bed6250dc5fe751eed0ec71e9c9bb1bf38a6ba7267bb16e007c46892  shots/1280-light-totals.png
e5cc319a930b6e5c8d96bf4d900f66639eb39dd74ab2c92f01917c06f293eec8  shots/1280-light-references.png
b90974b989fd5a484aa0160be26fead4b90f7302cf8dbc60ce28131bd8b845b7  shots/390-dark-totals.png
6d8f76a6513eaf64042ea04e89f5cff82d5c5b18ece139fe5c69d20000a45d50  shots/390-dark-references.png
```

## Executed native check

Use only with a fresh owned supervisor and the committed synthetic seller-server
fixture. ARCADE_CONFIRM_ORIGIN and ARCADE_SELLER_HUB are its returned loopback
origins; ARCADE_CONFIRM_SHOTS is its private screenshot directory. The script is
recorded for reproducibility, not authority to connect a real wallet or endpoint.

```python
import json,time,os
observations=[]
def evaluate(expression):
  result=cdp('Runtime.evaluate',expression=expression,returnByValue=True,awaitPromise=True,_response_timeout=8)
  assert 'exceptionDetails' not in result, result.get('exceptionDetails')
  return result['result'].get('value')
origin=os.environ['ARCADE_CONFIRM_ORIGIN']
hub=os.environ['ARCADE_SELLER_HUB']
seller='0x'+'3'*40
other='0x'+'4'*40
new_tab('about:blank')
assert wait_for_load(timeout=7)
activate_tab(current_tab())
cdp('Page.addScriptToEvaluateOnNewDocument',source="""
window.__sellerFixture={calls:[],mode:'success',resolve:null,errors:[]};
window.addEventListener('error',e=>window.__sellerFixture.errors.push(String(e.message).slice(0,200)));
window.ethereum={request({method}) { const f=window.__sellerFixture; f.calls.push(method);
if(method!=='eth_requestAccounts')return Promise.reject(Error('unexpected method'));
if(f.mode==='reject')return Promise.reject(Error('PRIVATE_WALLET_DIAGNOSTIC'));
if(f.mode==='malformed')return Promise.resolve(['PRIVATE_BAD_ACCOUNT']);
if(f.mode==='hold')return new Promise(resolve=>{f.resolve=resolve});
return Promise.resolve(['0x'+'3'.repeat(40)]); }};
""",_response_timeout=5)
def until(expression,seconds=8):
  deadline=time.monotonic()+seconds
  while not evaluate(expression):
    assert time.monotonic()<deadline,(expression,evaluate("JSON.stringify({url:location.href,errors:window.__sellerFixture?.errors,input:document.querySelector('#seller-address-input')?.value,selection:[document.querySelector('#seller-address-input')?.selectionStart,document.querySelector('#seller-address-input')?.selectionEnd],body:document.body.innerText.slice(0,1500)})"))
    time.sleep(.05)
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

def action(name): click(target('button',name))
def stats(): return evaluate("fetch("+json.dumps(hub+"/__seller-fixture")+").then(r=>r.json())")
def mode(value):
  evaluate("fetch("+json.dumps(hub+"/__seller-fixture?mode=")+"+"+json.dumps(value)+").then(r=>{if(!r.ok)throw Error('control')})")
def page(query=''):
  cdp('Page.navigate',url=origin+'/seller'+query,_response_timeout=5)
  assert wait_for_load(timeout=7)
  until("document.querySelector('#seller-address-input')!==null")
  until("Object.keys(document.querySelector('form.seller-address')).some(k=>k.startsWith('__reactProps'))",12)
def text(value):
  click(target('textbox','Public seller address'))
  cdp('Input.dispatchKeyEvent',type='keyDown',key='a',code='KeyA',modifiers=4,windowsVirtualKeyCode=65,commands=['selectAll'],_response_timeout=5)
  cdp('Input.dispatchKeyEvent',type='keyUp',key='a',code='KeyA',modifiers=4,windowsVirtualKeyCode=65,_response_timeout=5)
  cdp('Input.insertText',text=value,_response_timeout=5)
  until("document.querySelector('#seller-address-input').value==="+json.dumps(value),2)
def selected(value):
  return "new URL(location.href).searchParams.get('address')==="+json.dumps(value)
def note(name):
  data=evaluate("({calls:window.__sellerFixture.calls,errors:window.__sellerFixture.errors,width:innerWidth,documentWidth:document.documentElement.scrollWidth,urlAddress:new URL(location.href).searchParams.get('address'),rawDiagnostic:document.body.innerText.includes('PRIVATE_'),txLinks:document.querySelectorAll('.seller-page a[href*=\"/tx/\"]').length})")
  assert data['rawDiagnostic']==False and data['txLinks']==0 and not data['errors']
  assert all(method=='eth_requestAccounts' for method in data['calls']) and stats()['other']==0
  observations.append({'case':name,'browser':data,'hub':stats()});print(json.dumps(observations[-1]),flush=True)
mode('normal');page()
until("document.body.innerText.includes('Enter a public seller address')")
assert stats()['reads']==0 and evaluate("window.__sellerFixture.calls.length")==0
note('actual Start SSR and hydration are passive without address or wallet prompt')
text('bad');action('Show seller')
until("document.body.innerText.includes('Enter a nonzero')")
assert stats()['reads']==0
text(seller);press_key('Enter')
until(selected(seller)+" && document.body.innerText.includes('$0.084')")
assert stats()['reads']==1 and evaluate("window.__sellerFixture.calls.length")==0
note('native public-address form updates URL and fetches exactly one summary')
cdp('Page.reload',_response_timeout=5);assert wait_for_load(timeout=7)
until("document.body.innerText.includes('$0.084')")
assert stats()['reads']==2 and evaluate("window.__sellerFixture.calls.length")==0
note('bookmark reload retains selection without requiring wallet')
click(target('DisclosureTriangle','Public references — chain context unavailable'))
for width,height,scheme in [(1280,1000,'light'),(390,844,'dark')]:
  cdp('Emulation.setDeviceMetricsOverride',width=width,height=height,mobile=False,deviceScaleFactor=1,_response_timeout=5)
  cdp('Emulation.setEmulatedMedia',features=[{'name':'prefers-color-scheme','value':scheme}],_response_timeout=5)
  time.sleep(.1)
  assert evaluate("document.documentElement.scrollWidth<=innerWidth")
  target('heading','What the ledger says a seller earns.')
  capture_screenshot(os.environ['ARCADE_CONFIRM_SHOTS']+'/'+str(width)+'-'+scheme+'-totals.png',max_dim=1500)
  target('DisclosureTriangle','Public references — chain context unavailable')
  capture_screenshot(os.environ['ARCADE_CONFIRM_SHOTS']+'/'+str(width)+'-'+scheme+'-references.png',max_dim=1500)
note('desktop light and narrow dark totals, full addresses and unlinked references remain contained')
for value,expected in [('unknown-cost','Known inference subtotal'),('unknown-spend','Known direct sub-spend subtotal'),('negative','-$0.386'),('zero','$0.00'),('historical','No current listings'),('empty','No recorded settlements'),('fail','Seller summary unavailable'),('wrong-seller','Seller summary unavailable')]:
  mode(value);page('?address='+seller)
  until("document.body.innerText.includes("+json.dumps(expected)+")")
  assert stats()['reads']==1
  if value in ['unknown-cost','unknown-spend','empty']: assert evaluate("document.body.innerText.includes('Unavailable')")
  if value in ['fail','wrong-seller']: assert not evaluate("document.body.innerText.includes('No recorded settlements')")
  note(value+' keeps its distinct ledger meaning')
mode('normal');page('?address='+other)
until("document.body.innerText.includes('No recorded settlements')")
# Native action hydrates and requests only a public account.
action('Use wallet address')
until(selected(seller)+" && document.body.innerText.includes('$0.084')")
assert evaluate("window.__sellerFixture.calls.length")==1
note('explicit wallet selection performs one account request and no signing or chain switch')
for value in ['reject','malformed']:
  evaluate("window.__sellerFixture.mode="+json.dumps(value))
  action('Use wallet address')
  until("document.body.innerText.includes('Wallet address unavailable')")
  note(value+' wallet response shows a fixed public-address fallback')
evaluate("window.__sellerFixture.mode='hold'")
action('Use wallet address');until("window.__sellerFixture.resolve!==null")
text(other);action('Show seller')
until(selected(other)+" && document.body.innerText.includes('No recorded settlements')")
evaluate("window.__sellerFixture.resolve(["+json.dumps(seller)+"])")
time.sleep(.15)
assert evaluate(selected(other)+" && document.querySelector('#seller-address-input').value==="+json.dumps(other))
assert not evaluate("document.body.innerText.includes('$0.084')")
note('typing and newer selection cancel a held wallet; late completion cannot restore old totals')
print(json.dumps({'nativeComplete':len(observations),'proof':'synthetic public summary and provider on actual Start route only'}),flush=True)
```
