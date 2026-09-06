# H12b3 native browser check

2026-09-06 19:44 IST. Root-only, no independent reviewer. Actual Start local
/publish and fixed POST route, actual bounded CLI metadata previews; no real
model, upstream MCP, wallet, signature, payment, generated listing or deployment.

## Outcome and limits

Ten native cases passed on one isolated Chrome instance, maximum two renderers.
No shared browser/profile, live-service cookies or owner configuration was used.
The separate actual-route test also proves default mode is passive and refuses
preview POSTs, and local mode refuses a foreign Origin/traversal.

Native cases: passive SSR/hydration, traversal/bare-stdio refusal with zero POSTs,
explicit directory preview, desktop/narrow containment, clearing without a new
request, actual OpenAPI unwritten batch/manual commands, fixed missing-path
failure, edit after held response, Cancel after held response, and navigation
without persisted private output. No page search or localStorage entries, no
preview script elements and no browser errors were observed.

The late-delivery wrapper is deliberate fixture injection: it lets the actual
server/CLI response finish, ignores the client AbortSignal in that underlying
fetch and holds delivery. The real client/UI then aborts and discards its late
arrival. This proves no stale repaint, NOT that a browser disconnect interrupts
the server's already-completed CLI. H12b2 separately proves actual child abort/
timeout/parent-signal closure. Uncooperative upstream/server work retains its
runtime deadline and process lock; no immediate server termination is inferred.

Five screenshots were read:1280 light boundary/private,390 dark boundary/private,
390 dark generated/manual command. JSON is full escaped text inside bounded
scroll panels; native form typing/Enter and horizontal wheel scrolling worked.
The 390px run is desktop Chrome at narrow viewport, not real phone/touch or
screen-reader testing. No separate keyboard-scroll or production-hosted UI claim.

The supervisor's check exited0, and its four owned children were reaped. An
independent read-only check subsequently proved all five exact PIDs absent,
both former TCP ports ECONNREFUSED, and zero remaining owned profile/runtime
processes. A version-update advertisement was ignored; no harness update or
new install was performed. Screenshots/runtime files stay in the private owned
run directory; no local server is left serving those URLs.

## Frozen runtime evidence hashes

```text
7a58c5da30b9fdf8a62299de8e5d7adf0cb2175e5136b8f97a790001c73d0d12  check.py
896e59001723a8a8f8f7c181b52164fedd360abd26858b4d9f74a9c15afa15a6  supervise.ts
aac3a892996753c0e5aebabe792d7f1dd2e053e56d7496a8a2b1e58ecbf1a368  check.stdout.log
9bde33007a85cbd8e0a33bf892846693410474791d2120a8d928485082c857ba  cleanup.json
40d0dc804680c0c124346f08490e9cb795ac094fe82f868f94fa0b74c83468eb  shots/1280-light-boundary.png
cb54da2053fb24cf14e8a707467f66a6554adc36482d2ef5468fff4c4b8156af  shots/1280-light-private.png
49d7392a250dee8c1edeb746eecb179d6a8d79bfa0eb30d908bde627a16fdaae  shots/390-dark-boundary.png
d2d2fc5928582cf68f3bd6b1fc1fe5989e9168adfc59fe3d26422a07f7bbbd10  shots/390-dark-private.png
bec257b878d045611aefb354c975eb726061f97f4b360ad3229ba1c28b7a2717  shots/390-dark-generated.png
```

## Actual native check source

Environment supplies only the owned loopback origin and private screenshot path.
The supervisor owns fixture/Chrome/harness/check,220s lifetime,160s check deadline,
bounded logs and exact TERM/KILL/reap cleanup; no fire-and-forget daemon.

```python
import json,time,os
observations=[]
def evaluate(expression):
  result=cdp('Runtime.evaluate',expression=expression,returnByValue=True,awaitPromise=True,_response_timeout=8)
  assert 'exceptionDetails' not in result,result.get('exceptionDetails')
  return result['result'].get('value')
origin=os.environ['ARCADE_CONFIRM_ORIGIN']
new_tab('about:blank')
assert wait_for_load(timeout=7)
activate_tab(current_tab())
cdp('Page.addScriptToEvaluateOnNewDocument',source="""
window.__publishFixture={calls:[],mode:'normal',held:[],errors:[]};
window.addEventListener('error',e=>window.__publishFixture.errors.push(String(e.message).slice(0,200)));
const native=window.fetch.bind(window);
window.fetch=(input,init)=>{
 const url=new URL(input instanceof Request?input.url:String(input),location.href);
 if(url.origin!==location.origin)return Promise.reject(Error('Offline browser refused'));
 if(url.pathname!=='/api/publish-preview')return native(input,init);
 const f=window.__publishFixture;f.calls.push(url.pathname);
 if(f.mode==='hold')return native(input,{...init,signal:undefined}).then(response=>new Promise(resolve=>f.held.push(()=>resolve(response))));
 return native(input,init);
};
""",_response_timeout=5)
def until(expression,seconds=10):
  deadline=time.monotonic()+seconds
  while not evaluate(expression):
    assert time.monotonic()<deadline,(expression,evaluate("JSON.stringify({url:location.href,errors:window.__publishFixture?.errors,body:document.body.innerText.slice(0,1000)})"))
    time.sleep(.05)
def target(role,name):
  nodes=cdp('Accessibility.getFullAXTree',_response_timeout=5)['nodes']
  node=next(n for n in nodes if (role is None or n.get('role',{}).get('value')==role) and n.get('name',{}).get('value')==name)
  cdp('DOM.scrollIntoViewIfNeeded',backendNodeId=node['backendDOMNodeId'],_response_timeout=5)
  box=cdp('DOM.getBoxModel',backendNodeId=node['backendDOMNodeId'],_response_timeout=5)['model']['content']
  return (sum(box[0::2])/4,sum(box[1::2])/4)
def click(p):
  cdp('Input.dispatchMouseEvent',type='mouseMoved',x=p[0],y=p[1],_response_timeout=5)
  for kind in ['mousePressed','mouseReleased']:
    cdp('Input.dispatchMouseEvent',type=kind,x=p[0],y=p[1],button='left',buttons=1 if kind=='mousePressed' else 0,clickCount=1,_response_timeout=5)
def action(name): click(target('button',name))
def page():
  cdp('Page.navigate',url=origin+'/publish',_response_timeout=5)
  assert wait_for_load(timeout=7)
  until("document.querySelector('#publish-target')!==null")
  until("Object.keys(document.querySelector('.publish-page form')).some(k=>k.startsWith('__reactProps'))")
def text(value):
  click(target('textbox','Skill directory, OpenAPI JSON path, or mcp:// endpoint'))
  cdp('Input.dispatchKeyEvent',type='keyDown',key='a',code='KeyA',modifiers=4,windowsVirtualKeyCode=65,commands=['selectAll'],_response_timeout=5)
  cdp('Input.dispatchKeyEvent',type='keyUp',key='a',code='KeyA',modifiers=4,windowsVirtualKeyCode=65,_response_timeout=5)
  cdp('Input.insertText',text=value,_response_timeout=5)
  until("document.querySelector('#publish-target').value==="+json.dumps(value),2)
def note(name):
  data=evaluate("({requests:window.__publishFixture.calls.length,errors:window.__publishFixture.errors,width:innerWidth,documentWidth:document.documentElement.scrollWidth,path:location.pathname,search:location.search,storageKeys:Object.keys(localStorage),previewScripts:document.querySelectorAll('.publish-result script').length})")
  assert not data['errors'] and not data['search'] and data['previewScripts']==0
  assert not data['storageKeys']
  observations.append({'case':name,'browser':data});print(json.dumps(observations[-1]),flush=True)
page()
assert evaluate("window.__publishFixture.calls.length")==0
assert not evaluate("document.querySelector('.publish-result')!==null")
note('actual local SSR and hydration remain passive until explicit Preview')
for bad in ['../private','mcp://']:
  text(bad);action('Preview');until("document.body.innerText.includes('Use a relative')")
  assert evaluate("window.__publishFixture.calls.length")==0
note('traversal and bare stdio targets refuse before any preview POST')
text('skills/diff-triage');press_key('Enter')
until("document.body.innerText.includes('Preview ready.') && document.querySelector('.publish-result')!==null")
assert evaluate("document.querySelectorAll('.publish-entry').length")==1
assert evaluate("window.__publishFixture.calls.length")==1
note('native form POST returns actual directory CLI metadata with no URL or storage copy')
for width,height,scheme in [(1280,1000,'light'),(390,844,'dark')]:
  cdp('Emulation.setDeviceMetricsOverride',width=width,height=height,mobile=False,deviceScaleFactor=1,_response_timeout=5)
  cdp('Emulation.setEmulatedMedia',features=[{'name':'prefers-color-scheme','value':scheme}],_response_timeout=5)
  time.sleep(.1)
  assert evaluate("document.documentElement.scrollWidth<=innerWidth")
  target('heading','Directory metadata preview')
  capture_screenshot(os.environ['ARCADE_CONFIRM_SHOTS']+'/'+str(width)+'-'+scheme+'-boundary.png',max_dim=1500)
  target(None,'diff-triage private configuration JSON')
  capture_screenshot(os.environ['ARCADE_CONFIRM_SHOTS']+'/'+str(width)+'-'+scheme+'-private.png',max_dim=1500)
note('desktop light and narrow dark full JSON columns are contained and selectable')
action('Clear preview');until("!document.querySelector('.publish-result')")
assert evaluate("window.__publishFixture.calls.length")==1
note('explicit clear removes private preview without a new request')
text('packages/runner/test/fixtures/frankfurter.json');action('Preview')
until("document.body.innerText.includes('Unwritten listing previews') && document.body.innerText.includes('fx-rate')")
assert evaluate("window.__publishFixture.calls.length")==2
assert evaluate("document.body.innerText.includes('--yes') && document.body.innerText.includes('$0.05')")
p=target(None,'Manual terminal commands');click(p)
widths=evaluate("(()=>{const p=document.querySelector('pre[aria-label=\"Manual terminal commands\"]');return {scroll:p.scrollWidth,client:p.clientWidth}})()")
if widths['scroll']>widths['client']:
  cdp('Input.dispatchMouseEvent',type='mouseWheel',x=p[0],y=p[1],deltaX=400,deltaY=0,_response_timeout=5)
  until("document.querySelector('pre[aria-label=\"Manual terminal commands\"]').scrollLeft>0")
assert evaluate("document.documentElement.scrollWidth<=innerWidth")
capture_screenshot(os.environ['ARCADE_CONFIRM_SHOTS']+'/390-dark-generated.png',max_dim=1500)
note('actual OpenAPI CLI batch stays unwritten with explicit manual generation and contained terminal text')
text('missing-preview');action('Preview')
until("document.body.innerText.includes('Preview unavailable')")
assert not evaluate("document.querySelector('.publish-result')!==null")
note('valid missing path returns a fixed failure and hides prior private output')
for action_kind in ['edit','cancel']:
  text('skills/diff-triage')
  evaluate("window.__publishFixture.mode='hold';window.__publishFixture.held=[]")
  action('Preview');until("window.__publishFixture.held.length===1")
  if action_kind=='edit': text('skills/fx-rate')
  else: action('Cancel preview')
  until("!document.querySelector('.publish-result')")
  evaluate("window.__publishFixture.mode='normal';window.__publishFixture.held[0]()")
  time.sleep(.15)
  assert not evaluate("document.querySelector('.publish-result')!==null")
  if action_kind=='edit': assert evaluate("document.querySelector('#publish-target').value==='skills/fx-rate'")
  note(action_kind+' discards an injected late delivery of an actual CLI response')
text('skills/diff-triage');action('Preview')
until("document.body.innerText.includes('Preview ready.')")
click(target('link','buyer'));assert wait_for_load(timeout=7)
until("location.pathname==='/buyer'")
assert not evaluate("document.querySelector('.publish-result')!==null")
note('native page navigation leaves no persisted private preview')
print(json.dumps({'nativeComplete':len(observations),'proof':'actual Start/CLI with isolated late-fetch-delivery injection; no live MCP/model/wallet/payment'}),flush=True)
```
