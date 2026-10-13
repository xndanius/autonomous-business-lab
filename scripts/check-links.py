from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
import json,re,subprocess,tempfile,hashlib
ROOT=Path(__file__).resolve().parents[1]
class Page(HTMLParser):
 def __init__(self):super().__init__(convert_charrefs=True);self.ids=[];self.refs=[];self.scripts=[];self.cur=None;self.kind=None;self.frames=[];self.forms=[];self.links=[]
 def handle_starttag(self,tag,attrs):
  d=dict(attrs)
  if d.get('id'):self.ids.append(d['id'])
  if tag=='a' and d.get('name'):self.ids.append(d['name'])
  for attr in ('href','src','xlink:href'):
   if attr in d and d[attr]:self.refs.append({'tag':tag,'attr':attr,'value':d[attr]})
  if tag=='iframe':self.frames.append(d)
  if tag=='form':self.forms.append(d)
  if tag=='a':self.links.append(d)
  if tag=='script':self.cur=[];self.kind=d.get('type','');self.script_src=d.get('src')
 def handle_data(self,data):
  if self.cur is not None:self.cur.append(data)
 def handle_endtag(self,tag):
  if tag=='script'and self.cur is not None:self.scripts.append((self.kind,self.script_src,''.join(self.cur)));self.cur=None
pages={}
for file in ROOT.rglob('*.html'):
 if '.git' in file.parts:continue
 p=Page();p.feed(file.read_text());pages[file]=p
broken=[];external=0;refs=0;dups=[];syntax=[]
for file,p in pages.items():
 seen=set()
 for ident in p.ids:
  if ident in seen:dups.append({'page':str(file.relative_to(ROOT)),'id':ident})
  seen.add(ident)
 for ref in p.refs:
  raw=ref['value'];u=urlsplit(raw)
  if u.scheme in ('data','mailto','tel','javascript','blob'):continue
  if u.scheme or u.netloc:
   if u.hostname=='xndanius.github.io' and u.path.startswith('/autonomous-business-lab/'):
    dest=ROOT/unquote(u.path.removeprefix('/autonomous-business-lab/'))
   else:external+=1;continue
  else:
   path=unquote(u.path)
   if path.startswith('/'):
    if path.startswith('/autonomous-business-lab/'):dest=ROOT/path.removeprefix('/autonomous-business-lab/')
    else:broken.append({'page':str(file.relative_to(ROOT)),**ref,'reason':'root-relative path outside GitHub project prefix'});continue
   else:dest=file.parent/path if path else file
  dest=dest.resolve();refs+=1
  if dest.is_dir():dest=dest/'index.html'
  if not dest.is_file():broken.append({'page':str(file.relative_to(ROOT)),**ref,'target':str(dest.relative_to(ROOT))if dest.is_relative_to(ROOT)else str(dest),'reason':'missing file'});continue
  if u.fragment and dest.suffix.lower()=='.html':
   target=pages.get(dest)
   if target is None:target=Page();target.feed(dest.read_text())
   fragment=unquote(u.fragment)
   if fragment not in target.ids:broken.append({'page':str(file.relative_to(ROOT)),**ref,'target':str(dest.relative_to(ROOT)),'reason':'missing anchor '+fragment})
 for i,(kind,src,code) in enumerate(p.scripts):
  if src or not code.strip():continue
  if kind in ('application/json','application/ld+json','importmap'):
   try:json.loads(code)
   except Exception as e:syntax.append({'page':str(file.relative_to(ROOT)),'script':i,'kind':kind,'error':str(e)})
   continue
  with tempfile.NamedTemporaryFile(suffix='.mjs',mode='w',delete=False)as tmp:tmp.write(code);name=Path(tmp.name)
  r=subprocess.run(['node','--check',str(name)],capture_output=True,text=True);name.unlink()
  if r.returncode:syntax.append({'page':str(file.relative_to(ROOT)),'script':i,'error':r.stderr[:700]})
js_files=[]
for file in [*ROOT.rglob('*.js'),*ROOT.rglob('*.mjs')]:
 if '.git'in file.parts:continue
 with tempfile.NamedTemporaryFile(suffix='.mjs',mode='w',delete=False)as tmp:tmp.write(file.read_text());name=Path(tmp.name)
 r=subprocess.run(['node','--check',str(name)],capture_output=True,text=True);name.unlink();js_files.append(str(file.relative_to(ROOT)))
 if r.returncode:syntax.append({'file':str(file.relative_to(ROOT)),'error':r.stderr[:700]})
show=(ROOT/'show/index.html').read_text();show_page=pages[ROOT/'show/index.html']
offline=(ROOT/'show/lecture-offline.html').read_text();offline_page=pages[ROOT/'show/lecture-offline.html']
unsafe_refs=[]
for filename,page in [('show/index.html',show_page),('show/lecture-offline.html',offline_page)]:
 for r in page.refs:
  u=urlsplit(r['value'])
  if u.scheme=='data':continue
  if re.search(r'/(go|api|presenter|admin)(?:/|$)',u.path):unsafe_refs.append({'page':filename,**r})
report={'root':str(ROOT),'html_pages':len(pages),'internal_references_checked':refs,'external_references_not_fetched':external,'broken_references':broken,'duplicate_ids':dups,'js_files_checked':js_files,'syntax_errors':syntax,'show':{'projector_scenes':len(re.findall(r'<section[^>]+data-scene="\d+"',show)),'reading_scenes':len(re.findall(r'<section[^>]+data-read-scene="\d+"',show)),'frames':len(show_page.frames),'forms':len(show_page.forms),'unsafe_refs':unsafe_refs,'private_snapshot_markers':any(x in show or x in offline for x in ['SSE_OFFLINE_BACKUP','SSE_NOTES_HTML','STARTUP_DRAIN_SECRET','/presenter-notes-v'])},'offline':{'frames':len(offline_page.frames),'forms':len(offline_page.forms),'non_data_asset_refs':[r for r in offline_page.refs if r['tag']in ['img','script','link']and not r['value'].startswith('data:') and r['attr']in ['src','href']]}}

print(json.dumps(report,indent=2))

assert not broken and not dups and not syntax, "Broken links, duplicate IDs or invalid JavaScript"
assert not unsafe_refs and not report["show"]["private_snapshot_markers"], "Unsafe public archive content"
assert report["show"]["projector_scenes"] == report["show"]["reading_scenes"] == 18
assert not report["offline"]["non_data_asset_refs"], "Offline asset depends on network"
