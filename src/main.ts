import { $, el, esc } from "./dom";
import { createStateStore } from "./storage";
import { AS_EXTENSION, THEMES, WINDOWS_LOGO, applyThemeIdentity, themeFor } from "./themes";
import type { Appearance, FolderNode, MiniOSState } from "./types";

async function boot(): Promise<void> {
"use strict";
/* Running from the packaged extension (new tab override) or as a loose file? */
const AS_EXT = AS_EXTENSION;

/* The Windows flag artwork, used for the Start button and as the default wallpaper.
   A relative path, so it resolves the same on chrome-extension:// and file://. */
const LOGO = WINDOWS_LOGO;
let WALLPAPER_PRESETS = themeFor("win95").wallpapers;

/* ============================================================
   1. Icons — inline SVG, chunky on purpose
   ============================================================ */
let ICONS = themeFor("win95").icons;

/* ============================================================
   2. Default filesystem — folders of links
   ============================================================ */
let uid = 0;
const nid = () => "n" + (Date.now().toString(36)) + (uid++).toString(36) + Math.floor(Math.random()*1e4).toString(36);
const F = (name: string, children: any[]): FolderNode => ({ id: nid(), type:"folder", name, children });
const L = (name: string, url: string): any => ({ id: nid(), type:"link", name, url });

function defaultFS(): FolderNode {
  return F("C:", [
    F("Daily", [
      L("Gmail","https://mail.google.com"),
      L("Calendar","https://calendar.google.com"),
      L("Drive","https://drive.google.com"),
      L("Proton Mail","https://mail.proton.me"),
      L("Weather","https://weather.com"),
      L("Maps","https://maps.google.com")
    ]),
    F("Dev", [
      L("GitHub","https://github.com"),
      L("Stack Overflow","https://stackoverflow.com"),
      L("MDN","https://developer.mozilla.org"),
      L("npm","https://www.npmjs.com"),
      L("Regex101","https://regex101.com"),
      L("CanIUse","https://caniuse.com"),
      L("Localhost 3000","http://localhost:3000")
    ]),
    F("AI", [
      L("Claude","https://claude.ai"),
      L("Claude Code Docs","https://docs.claude.com/en/docs/claude-code/overview"),
      L("Anthropic Console","https://console.anthropic.com"),
      L("Hugging Face","https://huggingface.co")
    ]),
    F("Media", [
      L("YouTube","https://youtube.com"),
      L("Spotify","https://open.spotify.com"),
      L("Netflix","https://netflix.com"),
      L("Twitch","https://twitch.tv"),
      L("Internet Archive","https://archive.org")
    ]),
    F("Social", [
      L("Reddit","https://reddit.com"),
      L("Hacker News","https://news.ycombinator.com"),
      L("X","https://x.com"),
      L("Discord","https://discord.com/app"),
      L("LinkedIn","https://linkedin.com")
    ]),
    F("News", [
      L("AP News","https://apnews.com"),
      L("BBC","https://bbc.com/news"),
      L("Ars Technica","https://arstechnica.com"),
      L("The Verge","https://theverge.com")
    ]),
    F("Tools", [
      L("Speedtest","https://fast.com"),
      L("Translate","https://translate.google.com"),
      L("Excalidraw","https://excalidraw.com"),
      L("PDF tools","https://stirlingpdf.io")
    ])
  ]);
}

const ENGINES = {
  duckduckgo:{ name:"DuckDuckGo", url:"https://duckduckgo.com/?q=" },
  google:{ name:"Google", url:"https://www.google.com/search?q=" },
  bing:{ name:"Bing", url:"https://www.bing.com/search?q=" },
  brave:{ name:"Brave", url:"https://search.brave.com/search?q=" },
  startpage:{ name:"Startpage", url:"https://www.startpage.com/sp/search?query=" },
  perplexity:{ name:"Perplexity", url:"https://www.perplexity.ai/search?q=" }
};

const SHELLS = {
  powershell:{ label:"PowerShell", short:"PS", cls:"ps", icon:ICONS.terminal },
  bash:{ label:"Bash", short:"sh", cls:"bash", icon:ICONS.bash },
  zsh:{ label:"Zsh", short:"zsh", cls:"zsh", icon:ICONS.zsh }
};

/* ============================================================
   3. State + persistence
   ============================================================ */
const defaults = (): MiniOSState => ({
  version: 2,
  appearance: "win95",
  shell: "powershell",
  engine: "duckduckgo",
  linkTarget: "same",          // "same" | "new"
  desktopColor: "#008080",
  wallpaper: LOGO,             // filename beside index.html, a URL, or "" for none
  wallpaperMode: "fit",        // fit | center | tile | stretch
  wallpaperSize: 45,           // fit mode: height as a % of the desktop
  wallpaperFade: 100,          // 0-100, how strongly it shows over the desktop colour
  user: "matt",
  host: "web95",
  showOmni: true,
  showToday: true,
  crtEffect: true,
  npp: { name:"Welcome.txt", language:"Plain text", wrap:false, fontSize:12, text:"Welcome to MiniEditor!\n\nYour work is saved automatically in this browser.\nOpen or drop a text file to edit it, and use Download to keep a copy.\n\nShortcuts: Ctrl+S save · Ctrl+F find · Ctrl+H replace · Ctrl+G go to line\n" },
  notes: { welcome: "MiniOS scratch pad\n==================\n\nThis text is saved in your browser.\n" },
  iconPos: {},
  fs: defaultFS() as FolderNode
});

const stateStore = createStateStore(defaults);
let state = await stateStore.load();
let activeTheme = themeFor(state.appearance);
ICONS = activeTheme.icons;
WALLPAPER_PRESETS = activeTheme.wallpapers;
applyThemeIdentity(activeTheme);

async function wipe(){
  clearTimeout(saveTimer);
  await stateStore.clear();
}
let saveTimer=null;
function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    void stateStore.save(state).catch(error => console.error("Could not save MiniOS state", error));
  },120);
}

function setAppearance(appearance: Appearance): void {
  if(state.appearance === appearance) return;
  const previousTheme = activeTheme;
  const usedThemeWallpaper = previousTheme.wallpapers.some(preset => preset.src === state.wallpaper);
  state.appearance = appearance;
  activeTheme = themeFor(appearance);
  ICONS = activeTheme.icons;
  WALLPAPER_PRESETS = activeTheme.wallpapers;

  if(usedThemeWallpaper && activeTheme.wallpapers[0]){
    const preset = activeTheme.wallpapers[0];
    state.wallpaper = preset.src;
    state.wallpaperMode = preset.mode;
    state.wallpaperSize = preset.size;
    state.desktopColor = preset.color;
  }

  applyThemeIdentity(activeTheme);
  save();
  applyChrome();
  refreshWindowIcons();
  refreshAll();
}

/* --- tree index --------------------------------------------------- */
let byId: Record<string, any> = {}, parentOf: Record<string, any> = {};
function reindex(){
  byId = {}; parentOf = {};
  (function walk(n: any, p: any){
    byId[n.id] = n; parentOf[n.id] = p;
    if(n.type === "folder") (n.children || []).forEach(c => walk(c, n));
  })(state.fs, null);
}
reindex();

const isFolder = (n: any): n is FolderNode => !!n && n.type === "folder";
function pathOf(node){                     // array of nodes from root -> node
  const out = []; let n = node;
  while(n){ out.unshift(n); n = parentOf[n.id]; }
  return out;
}
function pathString(node, style){
  const p = pathOf(node);
  if(style === "mac"){
    return p.length === 1 ? activeTheme.computerName : activeTheme.computerName + ":" + p.slice(1).map(n=>n.name).join(":");
  }
  if(style === "win"){
    return p.length === 1 ? "C:\\" : "C:\\" + p.slice(1).map(n=>n.name).join("\\");
  }
  return p.length === 1 ? "~" : "~/" + p.slice(1).map(n=>n.name).join("/");
}
function findChild(folder, name){
  return (folder.children||[]).find(c => c.name.toLowerCase() === String(name).toLowerCase());
}
function uniqueName(folder, base){
  let name = base, i = 2;
  while(findChild(folder, name)) name = base + " (" + (i++) + ")";
  return name;
}
function addNode(folder, node){
  folder.children = folder.children || [];
  node.name = uniqueName(folder, node.name);
  folder.children.push(node);
  reindex(); save(); refreshAll();
  return node;
}
function removeNode(node){
  const p = parentOf[node.id];
  if(!p) return false;
  p.children = p.children.filter(c => c.id !== node.id);
  delete state.iconPos[node.id];
  reindex(); save(); refreshAll();
  return true;
}
function renameNode(node, name){
  const p = parentOf[node.id];
  node.name = p ? uniqueName(p, name) : name;
  save(); refreshAll();
}
function moveNode(node, dest){
  if(!isFolder(dest) || node === dest) return false;
  if(pathOf(dest).some(n => n.id === node.id)) return false;   // no cycles
  const p = parentOf[node.id];
  if(p) p.children = p.children.filter(c => c.id !== node.id);
  dest.children = dest.children || [];
  node.name = uniqueName(dest, node.name);
  dest.children.push(node);
  reindex(); save(); refreshAll();
  return true;
}

/* ============================================================
   4. Small helpers
   ============================================================ */
function normalizeUrl(u){
  u = String(u).trim();
  if(!u) return "";
  if(/^[a-z][a-z0-9+.-]*:\/\//i.test(u) || /^(mailto|about|chrome|edge|brave|file):/i.test(u)) return u;
  return "https://" + u.replace(/^\/+/, "");
}
function looksLikeUrl(s){
  s = s.trim();
  if(!s || /\s/.test(s)) return /^(https?|file|chrome|edge|brave|about):/i.test(s);
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^localhost(:\d+)?(\/|$)/i.test(s) ||
         /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(s);
}
/* An extension page may not navigate to browser-internal schemes, and may not reach
   file:// unless the user ticked "Allow access to file URLs". Say so instead of
   failing silently — the address is selectable so it can be pasted in the bar. */
const SCHEME = u => (String(u).match(/^([a-z][a-z0-9+.-]*):/i) || [,""])[1].toLowerCase();
function blockedAddress(url: string, why?: string){
  const internal = SCHEME(url) !== "file";
  dialog({
    title: "Cannot open that address",
    msgIcon: ICONS.warn,
    message: (internal
      ? "Browsers do not let an extension page open " + SCHEME(url) + ": addresses.\n\nCopy it into the address bar yourself:"
      : `This page cannot open local files unless you allow it.\n\nOn the extensions page, open ${activeTheme.shortName}'s details and turn on “Allow access to file URLs” — or paste this into the address bar:`)
      + (why ? "\n\n(" + why + ")" : ""),
    fields: [{ key:"url", label:"", value:url }],
    buttons: [{ label:"OK", value:true, primary:true }]
  });
}
function go(url){
  url = normalizeUrl(url);
  if(!url) return;
  const s = SCHEME(url);
  if(AS_EXT && /^(chrome|edge|brave|about|view-source|javascript|chrome-extension|data)$/.test(s) && url !== location.href){
    blockedAddress(url); return;
  }
  if(AS_EXT && s === "file"){
    if(typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create){
      chrome.tabs.create({ url }, () => {
        const err = chrome.runtime && chrome.runtime.lastError;
        if(err) blockedAddress(url, err.message);
      });
    } else blockedAddress(url);
    return;
  }
  if(state.linkTarget === "new") window.open(url, "_blank", "noopener");
  else window.location.href = url;
}
function searchUrl(q){ return ENGINES[state.engine].url + encodeURIComponent(q); }
function iconFor(n){ return isFolder(n) ? ICONS.folder : ICONS.link; }
function two(n){ return String(n).padStart(2,"0"); }

/* ============================================================
   5. Window manager
   ============================================================ */
let zTop = 100;
const wins = [];
const desktop = $("#desktop");

function makeWindow(opts: any): any {
  const o = Object.assign({ title:"Window", icon:ICONS.computer, w:640, h:420, x:null, y:null, kind:"generic" }, opts);
  const w: any = { id:"w"+(uid++), title:o.title, icon:o.icon, kind:o.kind, min:false, max:false, prev:null, api:{} };

  const node = el("div","win");
  const dw = desktop.clientWidth, dh = desktop.clientHeight;
  const W = Math.min(o.w, dw - 20), H = Math.min(o.h, dh - 20);
  const offset = (wins.length % 7) * 22;
  node.style.width = W + "px"; node.style.height = H + "px";
  node.style.left = (o.x != null ? o.x : Math.max(8, Math.round((dw - W)/2) - 60 + offset)) + "px";
  node.style.top  = (o.y != null ? o.y : Math.max(8, Math.round((dh - H)/2) - 40 + offset)) + "px";

  const tbar = el("div","tbar");
  const ti = el("img","ti"); ti.src = o.icon; ti.alt="";
  const tt = el("div","tt", o.title);
  const btns = el("div","btns");
  const bMin = el("button",null,"_"); bMin.title="Minimize";
  const bMax = el("button",null,"□"); bMax.title="Maximize";
  const bCls = el("button",null,"✕"); bCls.title="Close";
  btns.append(bMin,bMax,bCls);
  tbar.append(ti,tt,btns);

  const body = el("div","wbody");
  const grip = el("div","grip");
  node.append(tbar, body, grip);
  desktop.appendChild(node);

  w.node = node; w.body = body; w.titleEl = tt; w.iconEl = ti;
  w.setTitle = t => { w.title = t; tt.textContent = t; syncTasks(); };
  w.close = () => {
    if(w.onClose) try{ w.onClose(); }catch(e){}
    node.remove();
    const i = wins.indexOf(w); if(i>=0) wins.splice(i,1);
    syncTasks();
    const last = wins.filter(x=>!x.min).pop(); if(last) focusWin(last);
  };
  w.minimize = () => { w.min = true; node.classList.add("min"); syncTasks(); };
  w.restore = () => { w.min = false; node.classList.remove("min"); focusWin(w); };
  w.toggleMax = () => {
    if(w.max){
      Object.assign(node.style, w.prev); w.max = false; bMax.textContent = "□";
    } else {
      w.prev = { left:node.style.left, top:node.style.top, width:node.style.width, height:node.style.height };
      Object.assign(node.style, { left:"0px", top:"0px", width:desktop.clientWidth+"px", height:desktop.clientHeight+"px" });
      w.max = true; bMax.textContent = "❐";
    }
    if(w.onResize) w.onResize();
  };

  bMin.onclick = e => { e.stopPropagation(); w.minimize(); };
  bMax.onclick = e => { e.stopPropagation(); w.toggleMax(); };
  bCls.onclick = e => { e.stopPropagation(); w.close(); };
  tbar.addEventListener("dblclick", e => { if((e.target as HTMLElement).tagName !== "BUTTON") w.toggleMax(); });

  node.addEventListener("pointerdown", () => focusWin(w), true);
  dragify(tbar, node, w);
  resizify(grip, node, w);

  wins.push(w); focusWin(w); syncTasks();
  return w;
}

function focusWin(w: any){
  wins.forEach(x => x.node.classList.add("blur"));
  w.node.classList.remove("blur");
  w.node.style.zIndex = String(++zTop);
  w.min = false; w.node.classList.remove("min");
  active = w; syncTasks();
  if(w.onFocus) w.onFocus();
}
let active: any = null;

function dragify(handle: HTMLElement, node: HTMLElement, w: any){
  handle.addEventListener("pointerdown", e => {
    if((e.target as HTMLElement).tagName === "BUTTON" || w.max) return;
    handle.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY;
    const ox = node.offsetLeft, oy = node.offsetTop;
    const ow = node.offsetWidth, dw = desktop.clientWidth, dh = desktop.clientHeight;
    let dx = 0, dy = 0, frame = 0, finished = false;
    node.classList.add("dragging");
    const render = () => {
      frame = 0;
      node.style.transform = `translate3d(${dx}px,${dy}px,0)`;
    };
    const move = ev => {
      dx = Math.min(Math.max(ev.clientX - sx, -ow + 60 - ox), dw - 40 - ox);
      dy = Math.min(Math.max(ev.clientY - sy, -oy), dh - 24 - oy);
      if(!frame) frame = requestAnimationFrame(render);
    };
    const up = () => {
      if(finished) return;
      finished = true;
      if(frame) cancelAnimationFrame(frame);
      node.style.transform = "";
      node.style.left = ox + dx + "px"; node.style.top = oy + dy + "px";
      node.classList.remove("dragging");
      handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up); handle.removeEventListener("pointercancel", up);
      window.removeEventListener("pointerup", up, true); window.removeEventListener("pointercancel", up, true);
    };
    handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", up); handle.addEventListener("pointercancel", up);
    window.addEventListener("pointerup", up, true); window.addEventListener("pointercancel", up, true);
  });
}
function resizify(grip: HTMLElement, node: HTMLElement, w: any){
  grip.addEventListener("pointerdown", e => {
    e.stopPropagation();
    grip.setPointerCapture(e.pointerId);
    const sx=e.clientX, sy=e.clientY, ow=node.offsetWidth, oh=node.offsetHeight;
    let width = ow, height = oh, frame = 0, finished = false;
    node.classList.add("resizing");
    const render = () => {
      frame = 0;
      node.style.width = width + "px"; node.style.height = height + "px";
      if(w.onResize) w.onResize();
    };
    const move = ev => {
      width = Math.max(240, ow + ev.clientX - sx);
      height = Math.max(140, oh + ev.clientY - sy);
      if(!frame) frame = requestAnimationFrame(render);
    };
    const up = () => {
      if(finished) return;
      finished = true;
      if(frame){ cancelAnimationFrame(frame); render(); }
      node.classList.remove("resizing");
      grip.removeEventListener("pointermove", move); grip.removeEventListener("pointerup", up); grip.removeEventListener("pointercancel", up);
      window.removeEventListener("pointerup", up, true); window.removeEventListener("pointercancel", up, true);
    };
    grip.addEventListener("pointermove", move); grip.addEventListener("pointerup", up); grip.addEventListener("pointercancel", up);
    window.addEventListener("pointerup", up, true); window.addEventListener("pointercancel", up, true);
  });
}

function syncTasks(){
  const box = $("#tasks"); box.innerHTML = "";
  wins.forEach(w => {
    const b = el("button","task out");
    const i = el("img"); i.src = w.icon; i.alt="";
    b.append(i, el("span",null,w.title));
    if(active === w && !w.min) b.classList.add("pressed");
    b.onclick = () => { (active === w && !w.min) ? w.minimize() : w.restore(); };
    box.appendChild(b);
  });
}

/* ============================================================
   6. Modal dialogs (prompt / confirm / message)
   ============================================================ */
function dialog(opts: any): Promise<any> {
  // opts: {title, icon, message, fields:[{key,label,value,type}], buttons:[{label,value,primary}]}
  return new Promise(resolve => {
    const wrap = $("#modalwrap"), m = $("#modal");
    m.innerHTML = "";
    const tbar = el("div","tbar");
    const ti = el("img","ti"); ti.src = opts.icon || ICONS.settings; ti.alt="";
    const tt = el("div","tt", opts.title || activeTheme.shortName);
    const x = el("button",null,"✕");
    tbar.append(ti, tt, (()=>{ const d=el("div","btns"); d.append(x); return d; })());
    m.appendChild(tbar);

    const body = el("div","mbody");
    if(opts.message){
      const msg = el("div","msg");
      const im = el("img"); im.src = opts.msgIcon || ICONS.help; im.alt="";
      msg.append(im, el("div",null,opts.message));
      body.appendChild(msg);
    }
    const inputs: Record<string, HTMLInputElement | HTMLTextAreaElement> = {};
    (opts.fields||[]).forEach(f => {
      const box = el("div","f");
      if(f.label) box.appendChild(el("label",null,f.label));
      const inp: HTMLInputElement | HTMLTextAreaElement = f.type === "textarea" ? el("textarea") : el("input");
      if(inp instanceof HTMLInputElement) inp.type = "text";
      inp.value = f.value || "";
      inp.spellcheck = false;
      box.appendChild(inp); inputs[f.key] = inp;
      body.appendChild(box);
    });
    m.appendChild(body);

    const foot = el("div","mfoot");
    const buttons = opts.buttons || [{label:"OK",value:true,primary:true},{label:"Cancel",value:null}];
    buttons.forEach(b => {
      const btn = el("button",null,b.label);
      btn.onclick = () => finish(b.value === undefined ? b.label : b.value);
      foot.appendChild(btn);
    });
    m.appendChild(foot);
    wrap.classList.add("open");
    m.style.zIndex = String(++zTop);

    const first = Object.values(inputs)[0];
    if(first){ first.focus(); first.select(); } else foot.querySelector("button").focus();

    function finish(val){
      wrap.classList.remove("open");
      document.removeEventListener("keydown", key, true);
      if(val === null || val === false){ resolve(null); return; }
      const out: Record<string, string> = {};
      Object.keys(inputs).forEach(k => out[k] = inputs[k].value);
      resolve(Object.keys(inputs).length ? out : val);
    }
    function key(e){
      if(e.key === "Escape"){ e.preventDefault(); finish(null); }
      if(e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA"){
        e.preventDefault();
        const p = buttons.find(b=>b.primary) || buttons[0];
        finish(p.value === undefined ? p.label : p.value);
      }
    }
    document.addEventListener("keydown", key, true);
    x.onclick = () => finish(null);
  });
}
const say = (message: string, title?: string) => dialog({ title: title || activeTheme.shortName, message, msgIcon: ICONS.help, buttons:[{label:"OK",value:true,primary:true}] });
const ask = (message: string, title?: string) => dialog({ title: title || "Confirm", message, msgIcon: ICONS.warn,
  buttons:[{label:"Yes",value:true,primary:true},{label:"No",value:null}] }).then(r => !!r);

/* ============================================================
   7. Context menu
   ============================================================ */
const ctx = $("#ctx");
function menu(x: number, y: number, items: any[]){
  ctx.innerHTML = "";
  items.forEach(it => {
    if(it === "-"){ ctx.appendChild(el("div","mdiv")); return; }
    const m = el("div","mi" + (it.disabled ? " disabled" : ""));
    m.appendChild(el("span",null,it.label));
    if(!it.disabled) m.onclick = () => { hideMenus(); it.action && it.action(); };
    ctx.appendChild(m);
  });
  ctx.classList.add("open");
  ctx.style.zIndex = String(++zTop);
  const w = ctx.offsetWidth, h = ctx.offsetHeight;
  ctx.style.left = Math.min(x, window.innerWidth - w - 4) + "px";
  ctx.style.top  = Math.min(y, window.innerHeight - h - 4) + "px";
}
function hideMenus(){
  ctx.classList.remove("open");
  $("#startmenu").classList.remove("open");
  $("#start").classList.remove("pressed");
  document.querySelectorAll(".submenu.open").forEach(s => s.classList.remove("open"));
}
document.addEventListener("pointerdown", e => {
  const target = e.target as Node;
  if(!ctx.contains(target) && !$("#startmenu").contains(target) && !$("#start").contains(target)) hideMenus();
});
document.addEventListener("contextmenu", e => e.preventDefault());

/* ============================================================
   8. Node actions shared by desktop + explorer
   ============================================================ */
function openNode(n: any){
  if(isFolder(n)) openExplorer(n);
  else go(n.url);
}
function nodeMenu(n: any, x: number, y: number, ctxFolder?: any){
  const items = [
    { label:"Open", action:()=>openNode(n) },
    { label:"Open in new tab", disabled:isFolder(n), action:()=>window.open(normalizeUrl(n.url),"_blank","noopener") },
    "-",
    { label:"Rename…", action:async()=>{
        const r = await dialog({ title:"Rename", fields:[{key:"name",label:"New name:",value:n.name}] });
        if(r && r.name.trim()) renameNode(n, r.name.trim());
      }},
    { label:"Move to…", action:()=>moveDialog(n) },
    { label:"Delete", action:async()=>{
        if(await ask("Are you sure you want to delete '" + n.name + "'?", "Confirm Delete")) removeNode(n);
      }},
    "-",
    { label:"Properties…", action:()=>propsDialog(n) }
  ];
  menu(x, y, items);
}
function newItemsMenu(folder: FolderNode){
  return [
    { label:"New Folder", action:async()=>{
        const r = await dialog({ title:"New Folder", fields:[{key:"name",label:"Folder name:",value:"New Folder"}] });
        if(r && r.name.trim()) addNode(folder, F(r.name.trim(), []));
      }},
    { label:"New Shortcut…", action:async()=>{
        const r = await dialog({ title:"New Shortcut", fields:[
          {key:"name",label:"Name:",value:""},
          {key:"url",label:"Address (URL):",value:"https://"}
        ]});
        if(r && r.url.trim() && r.url.trim() !== "https://"){
          const url = normalizeUrl(r.url);
          let name = r.name.trim();
          if(!name){ try{ name = new URL(url).hostname.replace(/^www\./,""); }catch(e){ name = "Shortcut"; } }
          addNode(folder, L(name, url));
        }
      }}
  ];
}
async function propsDialog(n: any){
  if(isFolder(n)){
    const count = (n.children||[]).length;
    await say(n.name + "\n\nType: Folder\nLocation: " + pathString(n,"win") + "\nContains: " + count + " item(s)", n.name + " Properties");
  } else {
    const r = await dialog({ title:n.name + " Properties", fields:[
      {key:"name",label:"Name:",value:n.name},
      {key:"url",label:"Target address:",value:n.url}
    ]});
    if(r){
      if(r.name.trim()) renameNode(n, r.name.trim());
      if(r.url.trim()){ n.url = normalizeUrl(r.url); save(); refreshAll(); }
    }
  }
}
async function moveDialog(n: any){
  const folders = [];
  (function walk(f){ folders.push(f); (f.children||[]).filter(isFolder).forEach(walk); })(state.fs);
  const opts = folders.filter(f => f !== n && !pathOf(f).some(p => p.id === n.id));
  const list = opts.map(f => pathString(f,"win")).join("\n");
  const r = await dialog({ title:"Move '" + n.name + "'",
    message:"Type the destination path:\n\nAvailable:\n" + list,
    fields:[{key:"dest",label:"Destination:",value:"C:\\"}] });
  if(!r) return;
  const dest = resolve(r.dest, state.fs);
  if(!dest || !isFolder(dest)){ say("Cannot find folder: " + r.dest, "Move"); return; }
  if(!moveNode(n, dest)) say("That move isn't possible.", "Move");
}

/* ============================================================
   9. Desktop icons
   ============================================================ */
const SYSTEM_ICONS = [
  { id:"sys:computer", name:()=>activeTheme.computerName, icon:()=>ICONS.computer, action:()=>openExplorer(state.fs) },
  { id:"sys:term",     name:"Terminal",    icon:()=>SHELLS[state.shell].icon, action:()=>openTerminal() },
  { id:"sys:notepad",  name:"Notepad",     icon:()=>ICONS.notepad, action:()=>openNotepad("welcome") },
  { id:"sys:npp",      name:"MiniEditor",  icon:()=>ICONS.npp, action:()=>openMiniEditor() },
  { id:"sys:settings", name:()=>activeTheme.menu.settings, icon:()=>ICONS.settings, action:()=>openSettings() },
  { id:"sys:help",     name:"Read Me",     icon:()=>ICONS.help, action:()=>openHelp() }
];

/* Column-major auto layout that steps around the desktop search bar. */
function freeSlots(count){
  const pad = 12, cw = 84, ch = 84, iw = 76, ih = 70;
  const maxY = Math.max(pad, desktop.clientHeight - ih - 6);
  const maxCol = Math.max(1, Math.floor((desktop.clientWidth - pad) / cw));
  let o = null;
  if(state.showOmni){
    const r = $("#omni").getBoundingClientRect();
    if(r.width) o = { left:r.left - 8, top:r.top - 8, right:r.right + 8, bottom:r.bottom + 8 };
  }
  const out = [];
  for(let col = 0; col < maxCol + 4 && out.length < count; col++){
    const x = pad + col * cw;
    for(let y = pad; y <= maxY && out.length < count; y += ch){
      if(o && !(x + iw < o.left || x > o.right || y + ih < o.top || y > o.bottom)) continue;
      out.push({ x, y });
    }
  }
  while(out.length < count) out.push({ x:pad, y:pad });
  return out;
}
function renderIcons(){
  const box = $("#icons"); box.innerHTML = "";
  const entries = [];
  SYSTEM_ICONS.forEach(s => entries.push({ key:s.id, name:(typeof s.name==="function"?s.name():s.name), icon:(typeof s.icon==="function"?s.icon():s.icon), sys:s }));
  (state.fs.children||[]).forEach(n => entries.push({ key:n.id, name:n.name, icon:iconFor(n), node:n }));

  const auto = freeSlots(entries.filter(e => !state.iconPos[e.key]).length);
  let ai = 0;
  entries.forEach(e => {
    const d = el("div","icon");
    const pos = state.iconPos[e.key] || auto[ai++];
    d.style.left = pos.x + "px"; d.style.top = pos.y + "px";
    const img = el("img","glyph"); img.src = e.icon; img.alt = "";
    d.append(img, el("div","label", e.name));
    d.tabIndex = 0;

    const open = () => e.sys ? e.sys.action() : openNode(e.node);
    d.addEventListener("dblclick", open);
    d.addEventListener("keydown", ev => { if(ev.key === "Enter") open(); });
    d.addEventListener("pointerdown", ev => {
      document.querySelectorAll("#icons .icon.sel").forEach(x => x.classList.remove("sel"));
      d.classList.add("sel"); d.focus();
      // drag
      const sx = ev.clientX, sy = ev.clientY, ox = d.offsetLeft, oy = d.offsetTop;
      let moved = false, dx = 0, dy = 0, frame = 0, finished = false;
      d.setPointerCapture(ev.pointerId);
      const render = () => { frame = 0; d.style.transform = `translate3d(${dx}px,${dy}px,0)`; };
      const mv = m => {
        if(Math.abs(m.clientX-sx) + Math.abs(m.clientY-sy) < 4) return;
        moved = true;
        d.classList.add("dragging");
        dx = Math.max(-ox, Math.min(m.clientX - sx, desktop.clientWidth - 78 - ox));
        dy = Math.max(-oy, Math.min(m.clientY - sy, desktop.clientHeight - 70 - oy));
        if(!frame) frame = requestAnimationFrame(render);
      };
      const up = () => {
        if(finished) return;
        finished = true;
        if(frame) cancelAnimationFrame(frame);
        d.style.transform = ""; d.classList.remove("dragging");
        d.removeEventListener("pointermove", mv); d.removeEventListener("pointerup", up); d.removeEventListener("pointercancel", up);
        window.removeEventListener("pointerup", up, true); window.removeEventListener("pointercancel", up, true);
        if(moved){
          d.style.left = ox + dx + "px"; d.style.top = oy + dy + "px";
          state.iconPos[e.key] = { x:ox + dx, y:oy + dy }; save();
        }
      };
      d.addEventListener("pointermove", mv); d.addEventListener("pointerup", up); d.addEventListener("pointercancel", up);
      window.addEventListener("pointerup", up, true); window.addEventListener("pointercancel", up, true);
    });
    d.addEventListener("contextmenu", ev => {
      ev.preventDefault(); ev.stopPropagation();
      if(e.node) nodeMenu(e.node, ev.clientX, ev.clientY);
      else menu(ev.clientX, ev.clientY, [{ label:"Open", action:()=>e.sys.action() }]);
    });
    box.appendChild(d);
  });
}
desktop.addEventListener("contextmenu", e => {
  const target = e.target as HTMLElement;
  if(target.closest(".win") || target.closest("#omni") || target.closest("#today")) return;
  e.preventDefault();
  menu(e.clientX, e.clientY, [
    ...newItemsMenu(state.fs),
    "-",
    { label:"Line up icons", action:()=>{ state.iconPos = {}; save(); renderIcons(); } },
    { label:"Open Terminal", action:()=>openTerminal() },
    { label:state.showOmni ? "Hide search bar" : "Show search bar", action:()=>{ state.showOmni = !state.showOmni; save(); applyChrome(); } },
    { label:state.showToday ? "Hide MiniOS Today" : "Show MiniOS Today", action:()=>{ state.showToday = !state.showToday; save(); applyChrome(); } },
    { label:state.crtEffect !== false ? "Turn CRT effect off" : "Turn CRT effect on", action:()=>{ state.crtEffect = state.crtEffect === false; save(); applyChrome(); } },
    "-",
    { label:"Properties…", action:()=>openSettings() }
  ]);
});
desktop.addEventListener("pointerdown", e => {
  if(e.target === desktop || (e.target as HTMLElement).id === "icons")
    document.querySelectorAll("#icons .icon.sel").forEach(x => x.classList.remove("sel"));
});

/* ============================================================
   10. Explorer window
   ============================================================ */
const explorers = [];
function openExplorer(folder: FolderNode){
  const existing = explorers.find(x => x.folder === folder);
  if(existing){ focusWin(existing.win); return existing; }

  const winTitle = f => f === state.fs ? activeTheme.computerName : f.name;
  const w = makeWindow({ title:winTitle(folder), icon:ICONS.folderOpen, kind:"explorer", w:600, h:400 });
  const st: any = { win:w, folder, history:[folder], hi:0 };
  explorers.push(st);

  const mb = el("div","menubar");
  ["File","Edit","View","Help"].forEach(m => {
    const s = el("span",null,m);
    s.onclick = ev => {
      const r = s.getBoundingClientRect();
      if(m === "File") menu(r.left, r.bottom, [...newItemsMenu(st.folder), "-", { label:"Close", action:()=>w.close() }]);
      else if(m === "Edit") menu(r.left, r.bottom, [
        { label:"Sort by name", action:()=>{ st.folder.children.sort((a,b)=> (Number(isFolder(b))-Number(isFolder(a))) || a.name.localeCompare(b.name)); save(); refreshAll(); } },
        { label:"Select all", action:()=>st.pane.querySelectorAll(".item").forEach(i=>i.classList.add("sel")) }
      ]);
      else if(m === "View") menu(r.left, r.bottom, [
        { label:"Refresh", action:()=>render() },
        { label:"Open new window", action:()=>openExplorer(state.fs) }
      ]);
      else menu(r.left, r.bottom, [{ label:`About ${activeTheme.shortName}`, action:()=>openHelp() }]);
    };
    mb.appendChild(s);
  });

  const tb = el("div","toolbar");
  const bBack = el("button",null,"◀ Back"); const bFwd = el("button",null,"Forward ▶");
  const bUp = el("button"); bUp.append((()=>{ const i=el("img"); i.src=ICONS.up; i.style.width="14px"; i.style.height="14px"; return i; })());
  bUp.title = "Up one level";
  const addr = el("div","addr");
  addr.appendChild(el("span",null,"Address:"));
  const addrBox = el("div","in");
  const addrIcon = el("img"); addrIcon.src = ICONS.folder; addrIcon.style.width="16px"; addrIcon.style.height="16px";
  const addrText = el("span"); addrText.style.userSelect = "text";
  addrBox.append(addrIcon, addrText);
  addr.appendChild(addrBox);
  tb.append(bBack, bFwd, bUp, el("div","sep"), addr);

  const pane = el("div","pane"); st.pane = pane;
  const status = el("div","status");
  const s1 = el("div"); s1.style.flex = "1";
  const s2 = el("div"); s2.style.flex = "0 0 130px";
  status.append(s1, s2);

  w.body.append(mb, tb, pane, status);

  function nav(f: FolderNode, push=true){
    st.folder = f;
    if(push){ st.history = st.history.slice(0, st.hi+1); st.history.push(f); st.hi = st.history.length-1; }
    w.setTitle(winTitle(f));
    render();
  }
  function render(){
    if(!byId[st.folder.id]) st.folder = state.fs;   // folder was deleted
    const f = st.folder;
    addrText.textContent = pathString(f, state.appearance === "macos9" ? "mac" : "win");
    pane.innerHTML = "";
    const kids = (f.children||[]).slice().sort((a,b)=> (Number(isFolder(b))-Number(isFolder(a))) || a.name.localeCompare(b.name));
    if(!kids.length) pane.appendChild(el("div","empty","This folder is empty. Right-click to add a shortcut."));
    kids.forEach(n => {
      const it = el("div","item"); it.draggable = true;
      const img = el("img","glyph"); img.src = iconFor(n); img.alt="";
      it.append(img, el("div","label", n.name));
      it.title = isFolder(n) ? pathString(n,"win") : n.url;
      it.onpointerdown = () => { pane.querySelectorAll(".item.sel").forEach(x=>x.classList.remove("sel")); it.classList.add("sel"); s2.textContent = isFolder(n) ? "Folder" : "Internet Shortcut"; };
      it.ondblclick = () => isFolder(n) ? nav(n) : go(n.url);
      it.oncontextmenu = ev => { ev.preventDefault(); ev.stopPropagation(); nodeMenu(n, ev.clientX, ev.clientY); };
      it.ondragstart = ev => { ev.dataTransfer.setData("text/web95-id", n.id); ev.dataTransfer.effectAllowed = "move"; };
      if(isFolder(n)){
        it.ondragover = ev => { if(ev.dataTransfer.types.includes("text/web95-id")){ ev.preventDefault(); it.classList.add("sel"); } };
        it.ondragleave = () => it.classList.remove("sel");
        it.ondrop = ev => {
          ev.preventDefault(); ev.stopPropagation(); it.classList.remove("sel");
          const src = byId[ev.dataTransfer.getData("text/web95-id")];
          if(src) moveNode(src, n);
        };
      }
      pane.appendChild(it);
    });
    s1.textContent = kids.length + " object(s)";
    s2.textContent = f === state.fs ? activeTheme.computerName : "";
    bBack.disabled = st.hi === 0;
    bFwd.disabled = st.hi >= st.history.length-1;
    bUp.disabled = !parentOf[f.id];
  }
  pane.oncontextmenu = ev => {
    ev.preventDefault(); ev.stopPropagation();
    menu(ev.clientX, ev.clientY, [...newItemsMenu(st.folder), "-", { label:"Refresh", action:render },
      { label:"Properties…", action:()=>propsDialog(st.folder) }]);
  };
  pane.ondragover = ev => { if(ev.dataTransfer.types.includes("text/web95-id")) ev.preventDefault(); };
  pane.ondrop = ev => {
    ev.preventDefault();
    const src = byId[ev.dataTransfer.getData("text/web95-id")];
    if(src && parentOf[src.id] !== st.folder) moveNode(src, st.folder);
  };
  bBack.onclick = () => { if(st.hi > 0){ st.hi--; nav(st.history[st.hi], false); } };
  bFwd.onclick  = () => { if(st.hi < st.history.length-1){ st.hi++; nav(st.history[st.hi], false); } };
  bUp.onclick   = () => { const p = parentOf[st.folder.id]; if(p) nav(p); };

  st.render = render;
  w.onClose = () => { const i = explorers.indexOf(st); if(i>=0) explorers.splice(i,1); };
  render();
  return st;
}

/* ============================================================
   11. Terminal
   ============================================================ */
function openTerminal(shell?: string): any {
  const sh     =   shell || state.shell;
  const conf   =   SHELLS[sh];
  const w      =   makeWindow({ title:conf.label, icon:conf.icon, kind:"terminal", w:700, h:420 });
  const term   =   el("div","term " + conf.cls);
  const scroll =   el("div","scroll");
  const iline  =   el("div","inputline");
  const prompt =   el("span","prompt");
  const input  =   el("input","cmd"); input.spellcheck = false; input.autocapitalize = "off"; input.autocomplete = "off";
  iline.append(prompt, input);
  term.append(scroll, iline);
  w.body.appendChild(term);

  const S: any = { shell:sh, cwd:state.fs, hist:[], hi:0, term, scroll };
  w.onFocus = () => setTimeout(()=>input.focus(), 0);
  term.onpointerdown = e => { if(window.getSelection().isCollapsed && e.target !== input) input.focus(); };

  function out(html: string, cls?: string){
    const d = el("div","line" + (cls ? " " + cls : ""));
    d.innerHTML = html;
    scroll.appendChild(d);
    scroll.scrollTop = scroll.scrollHeight;
    return d;
  }
  function text(s: unknown, cls?: string){ return out(esc(s == null ? "" : s), cls); }
  S.out = out; S.text = text;

  function promptHTML(){
    const p = S.cwd;
    if(S.shell === "powershell") return `<span class="p2">PS ${esc(pathString(p,"win"))}&gt;</span> `;
    if(S.shell === "bash") return `<span class="p1">${esc(state.user)}@${esc(state.host)}</span>:<span class="p2">${esc(pathString(p,"nix"))}</span>$ `;
    return `<span class="p3">➜</span>  <span class="p2">${esc(pathString(p,"nix"))}</span> <span class="p1">❯</span> `;
  }
  function refreshPrompt(){
    prompt.innerHTML = promptHTML();
    term.className = "term " + SHELLS[S.shell].cls;
    w.setTitle(SHELLS[S.shell].label + " — " + pathString(S.cwd, S.shell === "powershell" ? "win" : "nix"));
    w.iconEl.src = SHELLS[S.shell].icon; w.icon = SHELLS[S.shell].icon; syncTasks();
  }
  S.refreshPrompt = refreshPrompt;

  banner(S);
  refreshPrompt();
  setTimeout(()=>input.focus(), 30);

  input.addEventListener("keydown", e => {
    if(e.key === "Enter"){
      const line = input.value;
      out(promptHTML() + esc(line));
      input.value = "";
      if(line.trim()){ S.hist.push(line); S.hi = S.hist.length; }
      try{ runCommand(S, line); }catch(err){ text(String(err), "err"); }
      refreshPrompt();
      scroll.scrollTop = scroll.scrollHeight;
    } else if(e.key === "ArrowUp"){
      e.preventDefault();
      if(S.hi > 0){ S.hi--; input.value = S.hist[S.hi]; }
    } else if(e.key === "ArrowDown"){
      e.preventDefault();
      if(S.hi < S.hist.length-1){ S.hi++; input.value = S.hist[S.hi]; }
      else { S.hi = S.hist.length; input.value = ""; }
    } else if(e.key === "Tab"){
      e.preventDefault();
      complete(S, input);
    } else if(e.key === "l" && e.ctrlKey){
      e.preventDefault(); scroll.innerHTML = "";
    } else if(e.key === "c" && e.ctrlKey && window.getSelection().isCollapsed){
      out(promptHTML() + esc(input.value) + '<span class="dim">^C</span>');
      input.value = "";
    }
  });
  S.win = w;
  return S;
}

function banner(S: any){
  const c = SHELLS[S.shell];
  if(S.shell === "powershell"){
    S.text(`Windows PowerShell (${activeTheme.shortName} Edition)`);
    S.text("Copyright (C) Nobody. All bookmarks reserved.");
  } else if(S.shell === "bash"){
    S.text("GNU bash, web95-release 5.2.web  (x86_64-pc-browser)");
  } else {
    S.text("zsh 5.9 (web95) — oh-my-web95 loaded");
  }
  S.out(`Type <span class="hd">help</span> for commands, <span class="hd">ls</span> to list bookmarks, <span class="hd">open &lt;name&gt;</span> to launch one.`, "dim");
  S.text("");
}

/* --- path resolution --------------------------------------------- */
function resolve(spec: unknown, cwd: any): any {
  const normalizedSpec = String(spec).trim().replace(/^["']|["']$/g, "");
  if(!normalizedSpec) return cwd;
  let node = cwd;
  let s = normalizedSpec;
  const macRoot = activeTheme.computerName;
  if(s.toLowerCase() === macRoot.toLowerCase() || s.toLowerCase().startsWith(macRoot.toLowerCase() + ":")){
    node = state.fs;
    s = s.slice(macRoot.length).replace(/^:+/,"");
  } else if(/^([a-z]:)?[\\/]/i.test(s) || s === "~" || s.startsWith("~/") || s.startsWith("~\\")){
    node = state.fs;
    s = s.replace(/^~/,"").replace(/^[a-z]:/i,"").replace(/^[\\/]+/,"");
  }
  const parts = s.split(/[\\/:]+/).filter(p => p.length);
  for(const p of parts){
    if(p === ".") continue;
    if(p === ".."){ node = parentOf[node.id] || state.fs; continue; }
    if(!isFolder(node)) return null;
    const kid = findChild(node, p);
    if(!kid) return null;
    node = kid;
  }
  return node;
}
function tokenize(line: string): string[] {
  const out = []; let cur = "", q = null;
  for(const ch of line){
    if(q){ if(ch === q){ q = null; } else cur += ch; continue; }
    if(ch === '"' || ch === "'"){ q = ch; continue; }
    if(/\s/.test(ch)){ if(cur){ out.push(cur); cur = ""; } continue; }
    cur += ch;
  }
  if(cur) out.push(cur);
  return out;
}
function complete(S: any, input: HTMLInputElement){
  const val = input.value;
  const parts = tokenize(val);
  const partial = /\s$/.test(val) ? "" : (parts[parts.length-1] || "");
  if(parts.length <= 1 && !/\s$/.test(val)){
    const names = Object.keys(COMMANDS).filter(c => c.startsWith(partial.toLowerCase()));
    if(names.length === 1) input.value = names[0] + " ";
    else if(names.length > 1){ S.out(promptHTMLPlain(S) + esc(val), "dim"); S.text(names.join("  ")); }
    return;
  }
  const slash = Math.max(partial.lastIndexOf("/"), partial.lastIndexOf("\\"));
  const dirPart = slash >= 0 ? partial.slice(0, slash+1) : "";
  const leaf = slash >= 0 ? partial.slice(slash+1) : partial;
  const base = resolve(dirPart || ".", S.cwd);
  if(!isFolder(base)) return;
  const cands = (base.children||[]).map(c => c.name).filter(n => n.toLowerCase().startsWith(leaf.toLowerCase()));
  if(cands.length === 1){
    const done = cands[0] + (isFolder(findChild(base, cands[0])) ? (S.shell === "powershell" ? "\\" : "/") : " ");
    const q = /\s/.test(cands[0]) ? '"' : "";
    input.value = val.slice(0, val.length - partial.length) + q + dirPart + done + (q ? '" ' : "");
  } else if(cands.length > 1){
    S.text(cands.join("   "));
  }
}
const promptHTMLPlain = (_S: any) => "";

/* --- command implementations ------------------------------------ */
function fmtList(S: any, folder: FolderNode){
  const kids = (folder.children||[]).slice().sort((a,b)=> (Number(isFolder(b))-Number(isFolder(a))) || a.name.localeCompare(b.name));
  if(!kids.length){ S.text("(empty)", "dim"); return; }
  if(S.shell === "powershell"){
    S.text("");
    S.text("    Directory: " + pathString(folder,"win"));
    S.text("");
    S.out('<span class="hd">Mode     Name                           Target</span>');
    S.out('<span class="hd">----     ----                           ------</span>');
    kids.forEach(n => {
      const mode = isFolder(n) ? "d----" : "-a---";
      const name = n.name.length > 30 ? n.name.slice(0,29) + "…" : n.name;
      const target = isFolder(n) ? String((n.children||[]).length) + " item(s)" : n.url;
      S.out(esc(mode) + "    " + (isFolder(n) ? `<span class="dir">${esc(name.padEnd(31))}</span>` : esc(name.padEnd(31))) +
            (isFolder(n) ? `<span class="dim">${esc(target)}</span>` : `<span class="lnk" data-url="${esc(normalizeUrl(n.url))}">${esc(target)}</span>`));
    });
    S.text("");
  } else {
    S.text("total " + kids.length);
    kids.forEach(n => {
      const perm = isFolder(n) ? "drwxr-xr-x" : "-rw-r--r--";
      const name = isFolder(n)
        ? `<span class="dir">${esc(n.name)}/</span>`
        : `<span class="ok">${esc(n.name)}</span> <span class="dim">-&gt;</span> <span class="lnk" data-url="${esc(normalizeUrl(n.url))}">${esc(n.url)}</span>`;
      S.out(`<span class="dim">${perm}  ${esc(state.user)}  ${esc(state.host)}</span>  ` + name);
    });
  }
}
function notFound(S: any, cmd: string){
  if(S.shell === "powershell")
    S.text(cmd + " : The term '" + cmd + "' is not recognized as the name of a cmdlet, function, script file, or operable program.", "err");
  else if(S.shell === "bash") S.text("bash: " + cmd + ": command not found", "err");
  else S.text("zsh: command not found: " + cmd, "err");
}
function needArg(S: any, command: string){ S.text(command + ": missing operand", "err"); }

const COMMANDS: Record<string, any> = {};
function cmd(names: string, help: string, fn: any){
  const list = names.split(/\s+/);
  list.forEach((n,i) => COMMANDS[n] = { run:fn, help, primary:list[0], alias:i>0 });
}

cmd("help man get-help ?", "Show this list", (S) => {
  S.text("");
  S.out('<span class="hd">' + esc(activeTheme.shortName) + ' shell — ' + SHELLS[S.shell].label + '</span>');
  S.text("");
  const seen = new Set();
  Object.keys(COMMANDS).forEach(k => {
    const c = COMMANDS[k];
    if(c.alias || seen.has(c.primary)) return;
    seen.add(c.primary);
    const aliases = Object.keys(COMMANDS).filter(x => COMMANDS[x].primary === c.primary && x !== c.primary);
    S.out('  <span class="ok">' + esc(c.primary.padEnd(12)) + '</span>' + esc(c.help) +
          (aliases.length ? ' <span class="dim">(' + esc(aliases.join(", ")) + ')</span>' : ""));
  });
  S.text("");
  S.out('  <span class="dim">Tab completes names · ↑/↓ walks history · Ctrl+L clears</span>');
  S.text("");
});
cmd("ls dir gci get-childitem l", "List the current folder", (S, args) => {
  const target = args.filter(a=>!a.startsWith("-"))[0];
  const n = resolve(target || ".", S.cwd);
  if(!n){ S.text("Cannot find path '" + target + "' because it does not exist.", "err"); return; }
  if(!isFolder(n)){ S.text(n.name + " -> " + n.url); return; }
  fmtList(S, n);
});
cmd("cd chdir set-location sl", "Change folder", (S, args) => {
  const spec = args[0];
  if(!spec){ if(S.shell !== "powershell") S.cwd = state.fs; else S.text(pathString(S.cwd,"win")); return; }
  if(spec === "-"){ S.cwd = S.prevCwd || S.cwd; return; }
  const n = resolve(spec, S.cwd);
  if(!n){ S.text((S.shell==="powershell" ? "Set-Location : Cannot find path '"+spec+"'." : "cd: no such file or directory: " + spec), "err"); return; }
  if(!isFolder(n)){ S.text("cd: not a directory: " + spec, "err"); return; }
  S.prevCwd = S.cwd; S.cwd = n;
});
cmd("pwd get-location gl", "Print current folder", (S) => {
  S.text(pathString(S.cwd, S.shell === "powershell" ? "win" : "nix"));
});
cmd("open start xdg-open launch", "Open a bookmark or URL", (S, args) => {
  if(!args.length) return needArg(S,"open");
  const raw = args.join(" ");
  const n = resolve(raw, S.cwd);
  if(n && !isFolder(n)){ S.out('Opening <span class="lnk">' + esc(n.url) + '</span>…', "ok"); setTimeout(()=>go(n.url), 200); return; }
  if(n && isFolder(n)){ openExplorer(n); S.text("Opened folder window: " + n.name, "ok"); return; }
  if(looksLikeUrl(raw)){ S.out('Opening <span class="lnk">' + esc(normalizeUrl(raw)) + '</span>…', "ok"); setTimeout(()=>go(raw), 200); return; }
  S.text("No bookmark or address matched: " + raw, "err");
});
cmd("cat type get-content gc", "Show a bookmark's address", (S, args) => {
  if(!args.length) return needArg(S,"cat");
  const n = resolve(args.join(" "), S.cwd);
  if(!n){ S.text("No such item: " + args.join(" "), "err"); return; }
  if(isFolder(n)){ S.text((S.shell==="powershell"?"Get-Content : ":"cat: ") + n.name + ": Is a directory", "err"); return; }
  S.out('<span class="lnk" data-url="' + esc(normalizeUrl(n.url)) + '">' + esc(n.url) + '</span>');
});
cmd("mkdir md new-folder", "Create a folder", (S, args) => {
  if(!args.length) return needArg(S,"mkdir");
  const name = args.join(" ");
  addNode(isFolder(S.cwd) ? S.cwd : state.fs, F(name, []));
  S.text("Created folder: " + name, "ok");
});
cmd("add new mklink touch", "Add a bookmark: add <name> <url>", (S, args) => {
  if(args.length < 1) { S.text("usage: add <name> <url>   (or: add <url>)", "warn"); return; }
  let name, url;
  if(args.length === 1){ url = normalizeUrl(args[0]); try{ name = new URL(url).hostname.replace(/^www\./,""); }catch(e){ name = args[0]; } }
  else { url = normalizeUrl(args[args.length-1]); name = args.slice(0,-1).join(" "); }
  if(!looksLikeUrl(url)){ S.text("That doesn't look like an address: " + url, "err"); return; }
  const n = addNode(S.cwd, L(name, url));
  S.out('Added <span class="ok">' + esc(n.name) + '</span> -> <span class="lnk">' + esc(n.url) + '</span>');
});
cmd("rm del remove-item ri rmdir", "Delete a folder or bookmark", (S, args) => {
  const spec = args.filter(a => !a.startsWith("-")).join(" ");
  if(!spec) return needArg(S,"rm");
  const n = resolve(spec, S.cwd);
  if(!n || n === state.fs){ S.text("Cannot remove '" + spec + "'", "err"); return; }
  if(isFolder(n) && (n.children||[]).length && !args.some(a => /^-(r|rf|f|force|recurse)/i.test(a))){
    S.text("rm: " + n.name + " is not empty (use -r)", "err"); return;
  }
  if(pathOf(S.cwd).some(p => p.id === n.id)) S.cwd = parentOf[n.id] || state.fs;
  removeNode(n);
  S.text("Removed " + n.name, "ok");
});
cmd("mv move ren rename-item rni", "Rename: mv <old> <new-name>", (S, args) => {
  if(args.length < 2){ S.text("usage: mv <name> <new name>", "warn"); return; }
  const n = resolve(args[0], S.cwd);
  if(!n || n === state.fs){ S.text("No such item: " + args[0], "err"); return; }
  const rest = args.slice(1).join(" ");
  const dest = resolve(rest, S.cwd);
  if(dest && isFolder(dest) && dest !== n){ moveNode(n, dest); S.text("Moved " + n.name + " to " + pathString(dest,"win"), "ok"); return; }
  renameNode(n, rest);
  S.text("Renamed to " + n.name, "ok");
});
cmd("tree", "Show the whole bookmark tree", (S, args) => {
  const root = resolve(args[0] || ".", S.cwd) || S.cwd;
  S.out('<span class="dir">' + esc(pathString(root, S.shell === "powershell" ? "win" : "nix")) + '</span>');
  (function walk(n, pre){
    const kids = (n.children||[]).slice().sort((a,b)=> (Number(isFolder(b))-Number(isFolder(a))) || a.name.localeCompare(b.name));
    kids.forEach((c,i) => {
      const last = i === kids.length-1;
      S.out('<span class="dim">' + pre + (last ? "└── " : "├── ") + '</span>' +
            (isFolder(c) ? '<span class="dir">' + esc(c.name) + '</span>' : esc(c.name)));
      if(isFolder(c)) walk(c, pre + (last ? "    " : "│   "));
    });
  })(root, "");
});
cmd("search find s", "Search the web", (S, args) => {
  if(!args.length){ S.text("usage: search <words>", "warn"); return; }
  const q = args.join(" ");
  S.out('Searching ' + esc(ENGINES[state.engine].name) + ' for "' + esc(q) + '"…', "ok");
  setTimeout(()=>go(searchUrl(q)), 200);
});
cmd("grep where select-string", "Find bookmarks by name or url", (S, args) => {
  if(!args.length){ S.text("usage: grep <text>", "warn"); return; }
  const q = args.join(" ").toLowerCase();
  let hits = 0;
  (function walk(n){
    (n.children||[]).forEach(c => {
      const hay = (c.name + " " + ("url" in c ? c.url : "")).toLowerCase();
      if(hay.includes(q)){
        hits++;
        S.out('<span class="dim">' + esc(pathString(parentOf[c.id], S.shell==="powershell"?"win":"nix")) + '</span>  ' +
              (isFolder(c) ? '<span class="dir">'+esc(c.name)+'</span>' : esc(c.name) + '  <span class="lnk" data-url="'+esc(normalizeUrl(c.url))+'">'+esc(c.url)+'</span>'));
      }
      if(isFolder(c)) walk(c);
    });
  })(state.fs);
  if(!hits) S.text("No matches.", "dim");
});
cmd("shell chsh set-shell", "Switch shell: shell powershell|bash|zsh", (S, args) => {
  const name = (args[0]||"").toLowerCase();
  const map = { powershell:"powershell", pwsh:"powershell", ps:"powershell", ps1:"powershell", bash:"bash", sh:"bash", zsh:"zsh" };
  if(!map[name]){ S.text("Available shells: powershell, bash, zsh", "warn"); S.text("Current: " + SHELLS[S.shell].label, "dim"); return; }
  S.shell = map[name];
  state.shell = S.shell; save(); applyChrome();
  S.scroll.innerHTML = "";
  banner(S);
  S.refreshPrompt();
});
cmd("clear cls clear-host", "Clear the screen", (S) => { S.scroll.innerHTML = ""; });
cmd("echo write-output write-host print", "Print text", (S, args) => { S.text(args.join(" ")); });
cmd("date get-date time", "Show date and time", (S) => { S.text(new Date().toString()); });
cmd("whoami", "Who am I", (S) => { S.text(S.shell === "powershell" ? state.host + "\\" + state.user : state.user); });
cmd("history h", "Show command history", (S) => {
  S.hist.forEach((h,i) => S.out('<span class="dim">' + String(i+1).padStart(4) + '</span>  ' + esc(h)));
});
cmd("notepad edit nano vi vim", "Open the notepad", (S, args) => {
  openNotepad(args.length ? args.join(" ") : "welcome");
  S.text("Opening notepad…", "ok");
});
cmd("minieditor editor npp notepad++ code", "Open MiniEditor", S => {
  openMiniEditor();
  S.text("Opening MiniEditor…", "ok");
});
cmd("explorer e", "Open a folder window", (S, args) => {
  const n = resolve(args.join(" ") || ".", S.cwd);
  if(!isFolder(n)){ S.text("Not a folder.", "err"); return; }
  openExplorer(n);
});
cmd("settings config prefs", "Open settings", (S) => { openSettings(); });
cmd("appearance theme os", "Switch desktop style: theme win95|macos9", (S, args) => {
  const requested = (args[0] || "").toLowerCase();
  const aliases = { win95:"win95", windows:"win95", windows95:"win95", mac:"macos9", macos:"macos9", macos9:"macos9" };
  const appearance = aliases[requested] as Appearance | undefined;
  if(!appearance){
    S.text("Desktop styles: win95, macos9", "warn");
    S.text("Current: " + state.appearance, "dim");
    return;
  }
  setAppearance(appearance);
  S.text("Desktop style set to " + activeTheme.name, "ok");
});
cmd("engine", "Set search engine: engine google", (S, args) => {
  const k = (args[0]||"").toLowerCase();
  if(!ENGINES[k]){ S.text("Engines: " + Object.keys(ENGINES).join(", "), "warn"); S.text("Current: " + ENGINES[state.engine].name, "dim"); return; }
  state.engine = k; save(); S.text("Search engine set to " + ENGINES[k].name, "ok");
});
cmd("wallpaper wall bg", "Set the wallpaper: wallpaper <file|none> [fit|center|tile|stretch]", (S, args) => {
  if(!args.length){
    S.text("wallpaper : " + (state.wallpaper || "(none)"));
    S.text("mode      : " + state.wallpaperMode + "   size: " + state.wallpaperSize + "%   strength: " + state.wallpaperFade + "%");
    S.out('usage: <span class="hd">wallpaper &lt;file|url|none&gt; [fit|center|tile|stretch] [10-100%]</span>', "dim");
    return;
  }
  const modes = Object.keys(WALL_MODES);
  const mode = args.find(a => modes.includes(a.toLowerCase()));
  const pct = args.find(a => /^\d{1,3}%?$/.test(a));
  const rest = args.filter(a => a !== mode && a !== pct).join(" ").trim();
  if(mode) state.wallpaperMode = mode.toLowerCase();
  if(pct) state.wallpaperSize = Math.max(10, Math.min(100, parseInt(pct, 10)));
  if(rest){
    if(/^(none|off|clear)$/i.test(rest)) state.wallpaper = "";
    else if(/^(logo|flag|win95|windows)$/i.test(rest)) state.wallpaper = LOGO;
    else state.wallpaper = rest;
  }
  save(); applyWallpaper();
  S.text("wallpaper: " + (state.wallpaper || "(none)") + "  [" + state.wallpaperMode + "]", "ok");
  if(state.wallpaper && !/^https?:/i.test(state.wallpaper))
    S.text("(the file must sit next to index.html)", "dim");
});
cmd("export backup", "Dump your MiniOS data as JSON", (S) => {
  openNotepad("__export__", JSON.stringify({ fs:state.fs, notes:state.notes, npp:state.npp }, null, 2), "Export.json");
  S.text("Opened export in notepad — copy it somewhere safe.", "ok");
});
cmd("neofetch winfetch about ver", "System info", (S) => {
  const art = [
    "        ,.=:^!^!t3Z3z.,        ",
    "       :tt:::tt333EE3         ",
    "       Et:::ztt33EEE  @Ee.,   ",
    "      ;tt:::tt333EE7 ;EEEEEEttt",
    "     :Et:::zt333EEQ. $EEEEEttt ",
    "     it::::tt333EEF @EEEEEEttt ",
    "    ;3=*^```\"*4EEV :EEEEEEttt  ",
    "    ,.=::::!t=., ` @EEEEEEtttz ",
    "   @EEEEEEEtttz.  \"QEEEEEEE\"   "
  ];
  const nodes = Object.keys(byId).length;
  const links = Object.values(byId).filter(n => n.type === "link").length;
  const info = [
    state.user + "@" + state.host,
    "-----------------",
    "OS: " + activeTheme.shortName + " " + (AS_EXT ? "(new tab edition)" : "(file edition)"),
    "Shell: " + SHELLS[S.shell].label,
    "Terminal: web95-term",
    "Engine: " + ENGINES[state.engine].name,
    "Folders: " + (nodes - links - 1),
    "Bookmarks: " + links,
    "Windows open: " + wins.length,
    "Resolution: " + window.innerWidth + "x" + window.innerHeight,
    "Uptime: " + Math.round((Date.now() - BOOT)/1000) + "s"
  ];
  const rows = Math.max(art.length, info.length);
  for(let i=0;i<rows;i++){
    const a = (art[i] || "").padEnd(32);
    const b = info[i] || "";
    S.out('<span class="p2">' + esc(a) + '</span>' + (i===0 ? '<span class="p1">' + esc(b) + '</span>' : esc(b)));
  }
});
cmd("exit quit logout", "Close this terminal", (S) => { S.win.close(); });
cmd("reset factory-reset", "Wipe everything and start fresh", async (S) => {
  if(await ask("This erases all your folders, bookmarks and notes. Continue?", `Reset ${activeTheme.shortName}`)){
    await wipe();
    state = defaults(); activeTheme = themeFor(state.appearance); ICONS = activeTheme.icons; WALLPAPER_PRESETS = activeTheme.wallpapers;
    reindex(); save(); applyChrome(); refreshWindowIcons(); refreshAll();
    S.text("Reset complete.", "ok");
  } else S.text("Cancelled.", "dim");
});

function runCommand(S, line){
  const raw = line.trim();
  if(!raw) return;
  const parts = tokenize(raw);
  const name = parts[0].toLowerCase();
  const args = parts.slice(1);
  // "cd.." and "./name" niceties
  const c = COMMANDS[name];
  if(c) return c.run(S, args, raw);
  // maybe it's a bookmark name or url typed directly
  const direct = resolve(raw, S.cwd);
  if(direct && !isFolder(direct)) return COMMANDS.open.run(S, [raw]);
  if(direct && isFolder(direct)) return COMMANDS.cd.run(S, [raw]);
  if(looksLikeUrl(raw)) return COMMANDS.open.run(S, [raw]);
  notFound(S, parts[0]);
}
document.addEventListener("click", e => {
  const t = (e.target as HTMLElement).closest<HTMLElement>(".term .lnk");
  if(t && t.dataset.url) go(t.dataset.url);
});

/* ============================================================
   12. Notepad
   ============================================================ */
function openNotepad(key: string, seed?: string, title?: string){
  const w = makeWindow({ title:(title || (key === "welcome" ? "Untitled" : key)) + " - Notepad", icon:ICONS.notepad, kind:"notepad", w:520, h:380 });
  const mb = el("div","menubar");
  ["File","Edit","Help"].forEach(m => {
    const s = el("span",null,m);
    s.onclick = () => {
      const r = s.getBoundingClientRect();
      if(m === "File") menu(r.left, r.bottom, [
        { label:"Save", action:()=>{ store(); flash("Saved."); } },
        { label:"Select all & copy", action:()=>{
            ta.select();
            /* async Clipboard API needs no permission here; execCommand is the fallback */
            const done = ok => flash(ok ? "Copied to the clipboard." : "Could not copy — press Ctrl+C.");
            if(navigator.clipboard && navigator.clipboard.writeText)
              navigator.clipboard.writeText(ta.value).then(()=>done(true), ()=>done(false));
            else done(!!(document.execCommand && document.execCommand("copy")));
          }},
        "-", { label:"Close", action:()=>w.close() }
      ]);
      else if(m === "Edit") menu(r.left, r.bottom, [
        { label:"Clear", action:()=>{ ta.value=""; store(); } },
        { label:"Word wrap (always on)", disabled:true }
      ]);
      else menu(r.left, r.bottom, [{ label:"About Notepad", action:()=>say(`${activeTheme.shortName} Notepad.\nText is stored in this browser only.`,"About") }]);
    };
    mb.appendChild(s);
  });
  const ta = el("textarea","note in");
  ta.value = seed != null ? seed : (state.notes[key] || "");
  ta.spellcheck = false;
  const status = el("div","status"); const s1 = el("div"); s1.style.flex="1"; status.append(s1);
  w.body.append(mb, ta, status);
  const store = () => { if(key !== "__export__"){ state.notes[key] = ta.value; save(); } };
  const flash = t => { s1.textContent = t; setTimeout(()=>{ s1.textContent = info(); }, 1400); };
  const info = () => ta.value.length + " chars · " + ta.value.split("\n").length + " lines" + (key === "__export__" ? " · not saved" : " · autosaved");
  ta.addEventListener("input", () => { store(); s1.textContent = info(); });
  s1.textContent = info();
  setTimeout(()=>ta.focus(), 30);
  return w;
}

function openMiniEditor(){
  const ex = wins.find(x => x.kind === "npp");
  if(ex){ focusWin(ex); return ex; }

  const doc = state.npp = Object.assign({
    name:"Untitled.txt", language:"Plain text", wrap:false, fontSize:12, text:""
  }, state.npp || {});
  const w = makeWindow({ title:doc.name + " — MiniEditor", icon:ICONS.npp, kind:"npp", w:760, h:520 });
  const mb = el("div","menubar");
  const toolbar = el("div","npp-toolbar");
  const tabs = el("div","npp-tabs");
  const tab = el("div","npp-tab");
  const tabName = el("span",null,doc.name); tab.title = doc.name; tab.appendChild(tabName); tabs.appendChild(tab);
  const editor = el("div","npp-editor");
  const lines = el("pre","npp-lines");
  const ta = el("textarea","npp-text");
  ta.value = doc.text || ""; ta.spellcheck = false; ta.wrap = doc.wrap ? "soft" : "off";
  ta.setAttribute("aria-label","MiniEditor document editor");
  editor.append(lines,ta);

  const status = el("div","npp-status");
  const message = el("span","npp-message","Ready");
  const counts = el("span","npp-counts","");
  const position = el("span","npp-position","Ln 1, Col 1");
  const encoding = el("span",null,"UTF-8");
  const langStatus = el("span",null,doc.language);
  const zoomStatus = el("span","npp-zoom","100%");
  status.append(message,counts,position,encoding,langStatus,zoomStatus);

  let flashTimer = null;
  const flash = text => {
    clearTimeout(flashTimer); message.textContent = text;
    flashTimer = setTimeout(()=>{ message.textContent = "Saved locally"; },1500);
  };
  const saveNow = () => {
    doc.text = ta.value;
    state.npp = doc;
    save();
  };
  const queueSavedMessage = () => {
    clearTimeout(flashTimer); message.textContent = "Saving…";
    flashTimer = setTimeout(()=>{ message.textContent = "Saved locally"; },260);
  };
  const refreshPosition = () => {
    const before = ta.value.slice(0,ta.selectionStart);
    const line = before.split("\n").length;
    const lastBreak = before.lastIndexOf("\n");
    const selected = Math.abs(ta.selectionEnd - ta.selectionStart);
    position.textContent = "Ln " + line + ", Col " + (before.length - lastBreak) + (selected ? " · Sel " + selected : "");
  };
  const refreshEditor = () => {
    const lineCount = Math.max(1,ta.value.split("\n").length);
    const wordCount = (ta.value.match(/\S+/g) || []).length;
    lines.textContent = Array.from({length:lineCount},(_,i)=>i+1).join("\n");
    lines.style.flexBasis = Math.max(44,String(lineCount).length * 8 + 20) + "px";
    counts.textContent = lineCount + " lines · " + wordCount + " words · " + ta.value.length + " chars";
    refreshPosition();
  };
  const syncDocumentName = () => {
    tabName.textContent = doc.name; tab.title = doc.name;
    w.setTitle(doc.name + " — MiniEditor");
  };
  const setWrap = on => {
    doc.wrap = !!on;
    ta.wrap = doc.wrap ? "soft" : "off";
    ta.classList.toggle("wrap",doc.wrap);
    bWrap.classList.toggle("pressed",doc.wrap);
    bWrap.setAttribute("aria-pressed",doc.wrap ? "true" : "false");
    saveNow();
  };
  const setFontSize = size => {
    doc.fontSize = Math.max(10,Math.min(18,Number(size) || 12));
    editor.style.setProperty("--editor-font-size",doc.fontSize + "px");
    zoomStatus.textContent = Math.round(doc.fontSize / 12 * 100) + "%";
    saveNow();
  };
  const rename = async () => {
    const r = await dialog({ title:"Rename document", icon:ICONS.npp, fields:[{key:"name",label:"File name:",value:doc.name}] });
    if(!r || !r.name.trim()) return;
    doc.name = r.name.trim(); syncDocumentName();
    saveNow(); flash("Renamed");
  };
  const newDocument = async () => {
    if(ta.value.trim() && !(await ask("Start a new document? Your current document is already saved locally.","MiniEditor"))) return;
    ta.value = ""; doc.name = "Untitled.txt"; doc.language = "Plain text";
    language.value = doc.language; langStatus.textContent = doc.language; syncDocumentName();
    saveNow(); refreshEditor(); ta.focus(); flash("New document");
  };
  let lastFind = "";
  const findNext = (query?: string) => {
    const needleText = query || lastFind;
    if(!needleText){ findText(); return; }
    lastFind = needleText;
    const haystack = ta.value.toLowerCase(), needle = needleText.toLowerCase();
    let at = haystack.indexOf(needle,ta.selectionEnd);
    if(at < 0) at = haystack.indexOf(needle,0);
    if(at < 0){ flash("Text not found"); return; }
    ta.focus(); ta.setSelectionRange(at,at+needleText.length); refreshPosition(); flash("Match selected");
  };
  const findText = async () => {
    const r = await dialog({ title:"Find", icon:ICONS.find, fields:[{key:"query",label:"Find what:",value:lastFind}] });
    if(!r || !r.query) return;
    findNext(r.query);
  };
  const replaceText = async () => {
    const selected = ta.value.slice(ta.selectionStart,ta.selectionEnd);
    const r = await dialog({ title:"Replace all", icon:ICONS.find, fields:[
      {key:"find",label:"Find what:",value:selected || lastFind},
      {key:"replacement",label:"Replace with:",value:""}
    ], buttons:[{label:"Replace all",value:true,primary:true},{label:"Cancel",value:null}] });
    if(!r || !r.find) return;
    lastFind = r.find;
    const pieces = ta.value.split(r.find);
    const replacements = pieces.length - 1;
    if(!replacements){ flash("Text not found"); ta.focus(); return; }
    ta.value = pieces.join(r.replacement);
    saveNow(); refreshEditor(); queueSavedMessage(); ta.focus();
    flash(replacements + (replacements === 1 ? " replacement" : " replacements"));
  };
  const goToLine = async () => {
    const current = ta.value.slice(0,ta.selectionStart).split("\n").length;
    const r = await dialog({ title:"Go to line", icon:ICONS.find, fields:[{key:"line",label:"Line number:",value:String(current)}] });
    if(!r) return;
    const allLines = ta.value.split("\n");
    const target = Math.max(1,Math.min(allLines.length,parseInt(r.line,10) || 1));
    const at = allLines.slice(0,target-1).reduce((n,line)=>n+line.length+1,0);
    ta.focus(); ta.setSelectionRange(at,at); refreshPosition(); flash("Line " + target);
  };
  const copyAll = () => {
    ta.select();
    const done = ok => flash(ok ? "Copied to clipboard" : "Press Ctrl+C to copy");
    if(navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(ta.value).then(()=>done(true),()=>done(false));
    else done(!!(document.execCommand && document.execCommand("copy")));
  };
  const downloadDocument = () => {
    saveNow();
    const safeName = (doc.name || "Untitled.txt").replace(/[<>:"/\\|?*\x00-\x1f]/g,"_");
    const url = URL.createObjectURL(new Blob([ta.value],{type:"text/plain;charset=utf-8"}));
    const a = el("a"); a.href = url; a.download = safeName; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000); flash("Downloaded " + safeName);
  };
  const fileInput = el("input","npp-file-input");
  fileInput.type = "file"; fileInput.accept = ".txt,.md,.markdown,.js,.mjs,.cjs,.html,.htm,.css,.json,.xml,.csv,.log,.sh,.ps1,text/*";
  const languageForName = name => {
    const ext = (name.split(".").pop() || "").toLowerCase();
    return ({js:"JavaScript",mjs:"JavaScript",cjs:"JavaScript",html:"HTML",htm:"HTML",css:"CSS",json:"JSON",md:"Markdown",markdown:"Markdown",sh:"Shell",ps1:"PowerShell"})[ext] || "Plain text";
  };
  const loadFile = async file => {
    if(!file) return;
    if(ta.value.trim() && !(await ask("Open '" + file.name + "'? Your current document is already saved locally.","MiniEditor"))) return;
    try{
      ta.value = await file.text(); doc.name = file.name || "Untitled.txt"; doc.language = languageForName(doc.name);
      language.value = doc.language; langStatus.textContent = doc.language; syncDocumentName();
      saveNow(); refreshEditor(); ta.scrollTop = 0; lines.scrollTop = 0; ta.focus(); flash("Opened " + doc.name);
    }catch(e){ say("MiniEditor could not read that file.","Open file"); }
  };
  fileInput.onchange = () => { const file = fileInput.files && fileInput.files[0]; loadFile(file).finally(()=>{ fileInput.value = ""; }); };

  ["File","Edit","View","Language","Help"].forEach(name => {
    const item = el("span",null,name);
    item.onclick = () => {
      const r = item.getBoundingClientRect();
      if(name === "File") menu(r.left,r.bottom,[
        {label:"New                 Ctrl+N",action:newDocument},{label:"Open text file…  Ctrl+O",action:()=>fileInput.click()},
        "-",{label:"Save locally      Ctrl+S",action:()=>{ saveNow(); flash("Saved locally"); }},{label:"Download copy…",action:downloadDocument},{label:"Rename…",action:rename},
        "-",{label:"Select all & copy",action:copyAll},"-",{label:"Close",action:()=>w.close()}
      ]);
      else if(name === "Edit") menu(r.left,r.bottom,[
        {label:"Undo              Ctrl+Z",action:()=>{ ta.focus(); document.execCommand("undo"); refreshEditor(); saveNow(); }},
        {label:"Redo              Ctrl+Y",action:()=>{ ta.focus(); document.execCommand("redo"); refreshEditor(); saveNow(); }},
        "-",{label:"Select all        Ctrl+A",action:()=>{ ta.focus(); ta.select(); refreshPosition(); }},
        "-",{label:"Find…             Ctrl+F",action:findText},{label:"Find next              F3",action:()=>findNext()},{label:"Replace all…      Ctrl+H",action:replaceText},{label:"Go to line…       Ctrl+G",action:goToLine}
      ]);
      else if(name === "View") menu(r.left,r.bottom,[
        {label:(doc.wrap ? "✓ " : "") + "Word wrap",action:()=>setWrap(!doc.wrap)},"-",
        {label:"Zoom in        Ctrl++",action:()=>setFontSize(doc.fontSize+1)},{label:"Zoom out       Ctrl+-",action:()=>setFontSize(doc.fontSize-1)},{label:"Reset zoom     Ctrl+0",action:()=>setFontSize(12)}
      ]);
      else if(name === "Language") menu(r.left,r.bottom,LANGUAGES.map(label => ({label:(doc.language === label ? "✓ " : "") + label,action:()=>setLanguage(label)})));
      else menu(r.left,r.bottom,[{label:"Keyboard shortcuts",action:()=>say("Ctrl+N  New document\nCtrl+O  Open text file\nCtrl+S  Save locally\nCtrl+F  Find\nF3  Find next\nCtrl+H  Replace all\nCtrl+G  Go to line\nCtrl++ / Ctrl+-  Zoom\nTab / Shift+Tab  Indent / outdent","MiniEditor shortcuts")},"-",{label:"About MiniEditor",action:()=>say(`A small, focused editor for ${activeTheme.shortName}. Documents autosave in this browser, and can be opened from or downloaded to your computer.`,"MiniEditor")}]);
    };
    mb.appendChild(item);
  });

  const bNew = el("button",null,"New"); bNew.onclick = newDocument;
  const bOpen = el("button",null,"Open"); bOpen.onclick = () => fileInput.click();
  const bSave = el("button",null,"Save"); bSave.onclick = () => { saveNow(); flash("Saved locally"); };
  const bDownload = el("button",null,"Download"); bDownload.onclick = downloadDocument;
  const bFind = el("button",null,"Find"); bFind.onclick = findText;
  const bWrap = el("button",null,"Wrap"); bWrap.onclick = () => setWrap(!doc.wrap);
  ([[bNew,"New document (Ctrl+N)"],[bOpen,"Open a text file (Ctrl+O)"],[bSave,"Save in this browser (Ctrl+S)"],[bDownload,"Download a copy"],[bFind,"Find text (Ctrl+F)"],[bWrap,"Toggle word wrap"]] as Array<[HTMLButtonElement,string]>).forEach(([button,title])=>button.title=title);
  const language = el("select");
  const LANGUAGES = ["Plain text","JavaScript","HTML","CSS","JSON","Markdown","Shell","PowerShell"];
  LANGUAGES.forEach(name => { const o=el("option",null,name); o.value=name; if(name===doc.language)o.selected=true; language.appendChild(o); });
  const setLanguage = name => { doc.language=name; language.value=name; langStatus.textContent=name; saveNow(); flash(name + " mode"); };
  language.onchange = () => setLanguage(language.value);
  const languageLabel = el("label"); languageLabel.append(el("span",null,"Language:"),language);
  toolbar.append(bNew,bOpen,bSave,bDownload,el("span","sep"),bFind,bWrap,el("span","sep"),languageLabel,fileInput);

  ta.addEventListener("input",()=>{ saveNow(); refreshEditor(); queueSavedMessage(); });
  ta.addEventListener("scroll",()=>{ lines.scrollTop=ta.scrollTop; });
  ["click","keyup","select"].forEach(type=>ta.addEventListener(type,refreshPosition));
  ta.addEventListener("keydown",e=>{
    if(e.ctrlKey && (e.key==="n" || e.key==="N")){ e.preventDefault(); newDocument(); return; }
    if(e.ctrlKey && (e.key==="o" || e.key==="O")){ e.preventDefault(); fileInput.click(); return; }
    if(e.ctrlKey && (e.key==="s" || e.key==="S")){ e.preventDefault(); saveNow(); flash("Saved locally"); return; }
    if(e.ctrlKey && (e.key==="f" || e.key==="F")){ e.preventDefault(); findText(); return; }
    if(e.ctrlKey && (e.key==="h" || e.key==="H")){ e.preventDefault(); replaceText(); return; }
    if(e.ctrlKey && (e.key==="g" || e.key==="G")){ e.preventDefault(); goToLine(); return; }
    if(e.key === "F3"){ e.preventDefault(); findNext(); return; }
    if(e.ctrlKey && (e.key === "+" || e.key === "=")){ e.preventDefault(); setFontSize(doc.fontSize+1); return; }
    if(e.ctrlKey && e.key === "-"){ e.preventDefault(); setFontSize(doc.fontSize-1); return; }
    if(e.ctrlKey && e.key === "0"){ e.preventDefault(); setFontSize(12); return; }
    if(e.key==="Tab"){
      e.preventDefault();
      const start = ta.selectionStart, end = ta.selectionEnd;
      const lineStart = ta.value.lastIndexOf("\n",start-1)+1;
      const block = ta.value.slice(lineStart,end);
      if(start !== end){
        const changed = e.shiftKey ? block.replace(/^( {1,2}|\t)/gm,"") : block.replace(/^/gm,"  ");
        ta.setRangeText(changed,lineStart,end,"select");
      }else if(e.shiftKey){
        const prefix = (ta.value.slice(lineStart).match(/^( {1,2}|\t)/) || [""])[0];
        if(prefix){ ta.setRangeText("",lineStart,lineStart+prefix.length,"end"); ta.setSelectionRange(Math.max(lineStart,start-prefix.length),Math.max(lineStart,start-prefix.length)); }
      }else ta.setRangeText("  ",start,end,"end");
      saveNow(); refreshEditor(); queueSavedMessage();
    }
  });
  editor.addEventListener("dragover",e=>{ if(e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")){ e.preventDefault(); editor.classList.add("drop-target"); } });
  editor.addEventListener("dragleave",e=>{ if(!editor.contains(e.relatedTarget as Node | null)) editor.classList.remove("drop-target"); });
  editor.addEventListener("drop",e=>{ e.preventDefault(); editor.classList.remove("drop-target"); loadFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
  w.onClose = saveNow;
  w.body.append(mb,toolbar,tabs,editor,status);
  setFontSize(doc.fontSize); setWrap(doc.wrap); refreshEditor();
  setTimeout(()=>ta.focus(),40);
  return w;
}

/* ============================================================
   13. Settings
   ============================================================ */
function openSettings(){
  const ex = wins.find(w => w.kind === "settings");
  if(ex){ focusWin(ex); return; }
  const w = makeWindow({ title:"Appearance & Shell", icon:ICONS.settings, kind:"settings", w:540, h:520 });
  const box = el("div","fields in");
  box.style.background = "var(--face)";

  // operating system personality
  const fsSystem = el("fieldset"); fsSystem.appendChild(el("legend",null,"Desktop style"));
  const systemChoices = el("div","os-choices");
  (["win95","macos9"] as Appearance[]).forEach(appearance => {
    const profile = THEMES[appearance];
    const label = el("label","os-choice");
    const radio = el("input"); radio.type = "radio"; radio.name = "appearance"; radio.value = appearance;
    radio.checked = state.appearance === appearance;
    const preview = el("img"); preview.src = profile.icons.computer; preview.alt = "";
    const copy = el("span"); copy.append(el("strong",null,profile.name),el("small",null,appearance === "win95" ? "Windows desktop and taskbar" : "Platinum windows and menu bar"));
    radio.onchange = () => {
      if(!radio.checked) return;
      setAppearance(appearance);
      w.close();
      setTimeout(openSettings, 0);
    };
    label.append(radio,preview,copy);
    systemChoices.appendChild(label);
  });
  fsSystem.append(systemChoices,el("div","hint","The same folders, notes, apps, and terminal are shared between both styles."));
  box.appendChild(fsSystem);

  // shell
  const fsShell = el("fieldset"); fsShell.appendChild(el("legend",null,"Default shell"));
  const rowShell = el("div","row");
  Object.keys(SHELLS).forEach(k => {
    const lab = el("label");
    const r = el("input"); r.type="radio"; r.name="shell"; r.value=k; r.checked = state.shell === k;
    r.onchange = () => { state.shell = k as MiniOSState["shell"]; save(); applyChrome(); };
    lab.append(r, el("span",null,SHELLS[k].label));
    rowShell.appendChild(lab);
  });
  fsShell.appendChild(rowShell);
  fsShell.appendChild(el("div","hint","New terminals start in this shell. Inside a terminal you can switch any time with: shell bash"));
  box.appendChild(fsShell);

  // search
  const fsSearch = el("fieldset"); fsSearch.appendChild(el("legend",null,"Search & links"));
  const r1 = el("div","row"); r1.appendChild(el("span",null,"Search engine:"));
  const sel = el("select");
  Object.keys(ENGINES).forEach(k => { const o = el("option",null,ENGINES[k].name); o.value = k; if(state.engine === k) o.selected = true; sel.appendChild(o); });
  sel.onchange = () => { state.engine = sel.value; save(); applyChrome(); };
  r1.appendChild(sel); fsSearch.appendChild(r1);

  const r2 = el("div","row"); r2.appendChild(el("span",null,"Open links in:"));
  [["same","This tab"],["new","New tab"]].forEach(([v,lbl]) => {
    const lab = el("label");
    const r = el("input"); r.type="radio"; r.name="lt"; r.checked = state.linkTarget === v;
    r.onchange = () => { state.linkTarget = v as MiniOSState["linkTarget"]; save(); };
    lab.append(r, el("span",null,lbl));
    r2.appendChild(lab);
  });
  fsSearch.appendChild(r2);
  const r2b = el("div","row");
  const labOmni = el("label");
  const cbOmni = el("input"); cbOmni.type = "checkbox"; cbOmni.checked = !!state.showOmni;
  cbOmni.onchange = () => { state.showOmni = cbOmni.checked; save(); applyChrome(); };
  labOmni.append(cbOmni, el("span",null,"Show the search bar on the desktop"));
  r2b.appendChild(labOmni); fsSearch.appendChild(r2b);
  const r2c = el("div","row");
  const labToday = el("label");
  const cbToday = el("input"); cbToday.type = "checkbox"; cbToday.checked = !!state.showToday;
  cbToday.onchange = () => { state.showToday = cbToday.checked; save(); applyChrome(); };
  labToday.append(cbToday, el("span",null,"Show MiniOS Today on the desktop"));
  r2c.appendChild(labToday); fsSearch.appendChild(r2c);
  box.appendChild(fsSearch);

  // appearance
  const fsLook = el("fieldset"); fsLook.appendChild(el("legend",null,"Appearance"));
  const r3 = el("div","row"); r3.appendChild(el("span",null,"Desktop colour:"));
  ["#008080","#3a6ea5","#5f89b4","#7b78a8","#000000","#7e9c7e","#a08050"].forEach(c => {
    const b = el("button"); b.style.background = c; b.style.minWidth = "26px"; b.style.width="26px"; b.style.height="20px";
    b.title = c;
    b.onclick = () => { state.desktopColor = c; save(); applyChrome(); };
    r3.appendChild(b);
  });
  fsLook.appendChild(r3);
  const r4 = el("div","row");
  r4.appendChild(el("span",null,"User / host:"));
  const iu = el("input"); iu.type="text"; iu.value = state.user; iu.style.width="90px";
  const ih = el("input"); ih.type="text"; ih.value = state.host; ih.style.width="90px";
  iu.oninput = () => { state.user = iu.value.replace(/\s/g,"") || "user"; save(); updateToday(new Date()); };
  ih.oninput = () => { state.host = ih.value.replace(/\s/g,"") || "web95"; save(); };
  r4.append(iu, el("span",null,"@"), ih);
  fsLook.appendChild(r4);
  const rCrt = el("div","row");
  const labCrt = el("label");
  const cbCrt = el("input"); cbCrt.type = "checkbox"; cbCrt.checked = state.crtEffect !== false;
  cbCrt.onchange = () => { state.crtEffect = cbCrt.checked; save(); applyChrome(); };
  labCrt.append(cbCrt, el("span",null,"Enable CRT screen effect"));
  rCrt.appendChild(labCrt); fsLook.appendChild(rCrt);
  fsLook.appendChild(el("div","hint","Adds scanlines, phosphor texture, glass shading and a very subtle flicker."));
  box.appendChild(fsLook);

  // wallpaper
  const fsWall = el("fieldset"); fsWall.appendChild(el("legend",null,"Wallpaper"));
  fsWall.appendChild(el("div","hint","Choose a built-in desktop:"));
  const grid = el("div","wallpaper-grid");
  const presetButtons = [];
  WALLPAPER_PRESETS.forEach(p => {
    const b = el("button","wallpaper-choice");
    const img = el("img"); img.src = p.src; img.alt = "";
    b.append(img, el("span",null,p.name));
    b.title = "Use " + p.name;
    b.onclick = () => {
      state.wallpaper = p.src;
      state.wallpaperMode = p.mode;
      state.wallpaperSize = p.size;
      state.wallpaperFade = 100;
      state.desktopColor = p.color;
      iw.value = p.src;
      save(); applyChrome(); refreshWallpaperControls();
    };
    presetButtons.push({ button:b, preset:p });
    grid.appendChild(b);
  });
  fsWall.appendChild(grid);

  const st1 = el("div","hint");
  const rw1 = el("div","row");
  rw1.appendChild(el("span",null,"Custom:"));
  const iw = el("input"); iw.type = "text"; iw.value = state.wallpaper || ""; iw.style.flex = "1"; iw.style.minWidth = "180px";
  iw.placeholder = "file beside index.html, or an image URL";
  const preview = el("img"); preview.alt = "Current wallpaper preview";
  Object.assign(preview.style, { width:"64px", height:"42px", objectFit:"cover", background:"var(--desktop)", border:"1px solid #808080" });
  rw1.append(iw, preview);
  fsWall.appendChild(rw1);

  const modeRadios = [];
  const rw2 = el("div","row");
  rw2.appendChild(el("span",null,"Display:"));
  [["fit","Fit"],["center","Centre"],["tile","Tile"],["stretch","Fill screen"]].forEach(([v,lbl]) => {
    const lab = el("label");
    const r = el("input"); r.type = "radio"; r.name = "wallmode"; r.checked = state.wallpaperMode === v;
    r.onchange = () => { state.wallpaperMode = v as MiniOSState["wallpaperMode"]; save(); applyWallpaper(); };
    modeRadios.push({ input:r, value:v });
    lab.append(r, el("span",null,lbl));
    rw2.appendChild(lab);
  });
  fsWall.appendChild(rw2);

  const rwS = el("div","row");
  rwS.appendChild(el("span",null,"Size:"));
  const sz = el("input"); sz.type = "range"; sz.min = "10"; sz.max = "100"; sz.step = "5";
  sz.value = String(state.wallpaperSize); sz.style.flex = "1";
  const szv = el("span",null, state.wallpaperSize + "%"); szv.style.minWidth = "34px";
  sz.oninput = () => { state.wallpaperSize = Number(sz.value); szv.textContent = sz.value + "%"; save(); applyWallpaper(); };
  sz.title = "Applies to Fit";
  rwS.append(sz, szv);
  fsWall.appendChild(rwS);

  const rw3 = el("div","row");
  rw3.appendChild(el("span",null,"Strength:"));
  const sl = el("input"); sl.type = "range"; sl.min = "0"; sl.max = "100"; sl.step = "5";
  sl.value = String(state.wallpaperFade); sl.style.flex = "1";
  const slv = el("span",null, state.wallpaperFade + "%"); slv.style.minWidth = "34px";
  sl.oninput = () => { state.wallpaperFade = Number(sl.value); slv.textContent = sl.value + "%"; save(); applyWallpaper(); };
  rw3.append(sl, slv);
  fsWall.appendChild(rw3);

  const refreshWallpaperControls = () => {
    preview.style.background = state.desktopColor;
    if(state.wallpaper){ preview.style.display = ""; preview.src = state.wallpaper; }
    else preview.style.display = "none";
    modeRadios.forEach(x => { x.input.checked = state.wallpaperMode === x.value; });
    sz.value = String(state.wallpaperSize); szv.textContent = sz.value + "%";
    sl.value = String(state.wallpaperFade); slv.textContent = sl.value + "%";
    presetButtons.forEach(x => {
      const selected = state.wallpaper === x.preset.src;
      x.button.classList.toggle("selected", selected);
      x.button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    st1.textContent = "You can also use a file in the MiniOS folder or paste an image URL.";
  };
  const syncWall = () => {
    state.wallpaper = iw.value.trim(); save(); applyWallpaper(); refreshWallpaperControls();
  };
  iw.oninput = syncWall;
  preview.onload = () => { st1.textContent = "You can also use a file in the MiniOS folder or paste an image URL."; };
  preview.onerror = () => { st1.textContent = "That image did not load — check the file name."; };
  const bNone = el("button",null,"No wallpaper");
  bNone.onclick = () => { iw.value = ""; syncWall(); };
  const rw4 = el("div","row"); rw4.appendChild(bNone);
  fsWall.append(rw4, st1);
  box.appendChild(fsWall);
  refreshWallpaperControls();

  // data
  const fsData = el("fieldset"); fsData.appendChild(el("legend",null,"Your data"));
  const r5 = el("div","row");
  const bExp = el("button",null,"Export…");
  bExp.onclick = () => openNotepad("__export__", JSON.stringify({ fs:state.fs, notes:state.notes, npp:state.npp }, null, 2), "Export.json");
  const bImp = el("button",null,"Import…");
  bImp.onclick = async () => {
    const r = await dialog({ title:"Import", fields:[{key:"json",label:"Paste an exported JSON:",value:"",type:"textarea"}] });
    if(!r || !r.json.trim()) return;
    try{
      const data = JSON.parse(r.json);
      if(!data.fs) throw new Error("No 'fs' in that JSON.");
      state.fs = data.fs;
      if(data.notes) state.notes = data.notes;
      if(data.npp) state.npp = data.npp;
      reindex(); save(); refreshAll();
      say("Import complete.","Import");
    }catch(e){ say("That JSON could not be read:\n" + e.message, "Import failed"); }
  };
  const bBook = el("button",null,"Import browser bookmarks…");
  bBook.style.minWidth = "0";
  bBook.onclick = () => importBookmarks(state.fs);
  r5.append(bExp, bImp);
  const rBook = el("div","row"); rBook.appendChild(bBook);
  fsData.append(r5, rBook);
  const r6 = el("div","row");
  const bReset = el("button",null,"Reset everything");
  bReset.onclick = async () => {
    if(await ask("Erase all folders, bookmarks, notes and settings?",`Reset ${activeTheme.shortName}`)){
      await wipe(); state = defaults(); activeTheme = themeFor(state.appearance); ICONS = activeTheme.icons; WALLPAPER_PRESETS = activeTheme.wallpapers;
      reindex(); save(); applyChrome(); refreshWindowIcons(); refreshAll();
    }
  };
  r6.appendChild(bReset);
  fsData.appendChild(r6);
  box.appendChild(fsData);

  const foot = el("div","row"); foot.style.justifyContent = "flex-end";
  const bOk = el("button",null,"OK"); bOk.onclick = () => w.close();
  foot.appendChild(bOk);
  box.appendChild(foot);

  w.body.appendChild(box);
  return w;
}

/* --- bookmark import (terminal) ---------------------------------- */
cmd("import-html", "Paste an exported bookmarks.html", async (S) => {
  const n = await importFromPaste(S.cwd);
  if(n == null){ S.text("Cancelled.", "dim"); return; }
  S.text("Imported " + n + " bookmark(s) into " + pathString(S.cwd,"win"), "ok");
});
cmd("import-browser import", "Import this browser's own bookmarks", (S) => {
  if(!AS_EXT){
    S.text("Only the installed extension can read the browser's bookmarks.", "warn");
    S.out('Run <span class="hd">import-html</span> to paste an export instead.', "dim");
    return;
  }
  if(bookmarksApi()){
    importFromBrowser(S.cwd).then(n => S.text("Imported " + n + " bookmark(s) into " + pathString(S.cwd,"win"), "ok"));
    return;
  }
  S.text("Permission needed. Settings → Import browser bookmarks… asks for it (a click is required).", "warn");
  openSettings();
});
function importNetscape(html: string, into: FolderNode){
  const doc = new DOMParser().parseFromString(html, "text/html");
  let n = 0;
  function walkDL(dl: Element, folder: FolderNode){
    Array.from(dl.children).forEach((child: Element) => {
      if(child.tagName !== "DT") return;
      const h3 = child.querySelector(":scope > H3");
      const a = child.querySelector(":scope > A");
      if(h3){
        const sub = F(h3.textContent.trim() || "Folder", []);
        folder.children = folder.children || []; sub.name = uniqueName(folder, sub.name); folder.children.push(sub);
        const inner = child.querySelector(":scope > DL");
        if(inner) walkDL(inner, sub);
      } else if(a){
        /* getAttribute, not .href — .href would resolve a relative link against this page */
        const href = (a.getAttribute("href") || "").trim();
        if(!/^[a-z][a-z0-9+.-]*:/i.test(href)) return;
        const node = L(a.textContent.trim() || href, href);
        folder.children = folder.children || []; node.name = uniqueName(folder, node.name); folder.children.push(node);
        n++;
      }
    });
  }
  doc.querySelectorAll("body > dl, body > DL").forEach(dl => walkDL(dl, into));
  if(!n){
    doc.querySelectorAll("a[href]").forEach(a => {
      const href = (a.getAttribute("href") || "").trim();
      if(!/^[a-z][a-z0-9+.-]*:/i.test(href)) return;
      const node = L(a.textContent.trim() || href, href);
      node.name = uniqueName(into, node.name); (into.children = into.children || []).push(node); n++;
    });
  }
  reindex(); save();
  return n;
}

/* ---- bookmark import: straight from the browser when allowed, paste otherwise ---- */
const bookmarksApi = () => (typeof chrome !== "undefined" && chrome.bookmarks) ? chrome.bookmarks : null;

async function importFromPaste(into){
  const r = await dialog({ title:"Import bookmarks.html",
    message: (AS_EXT
      ? `${activeTheme.shortName} can read your bookmarks directly if you grant it permission — click “Import browser bookmarks…” again and accept the browser's prompt.\n\nOr do it by hand: bookmark manager (Ctrl+Shift+O) → ⋮ → Export bookmarks, open the saved file in a text editor, and paste it here.`
      : "As a plain file this page cannot read your bookmarks. Export them from the browser (Ctrl+Shift+O → ⋮ → Export bookmarks), open the saved file in a text editor, then paste everything here."),
    fields:[{ key:"html", label:"bookmarks.html contents:", value:"", type:"textarea" }] });
  if(!r || !r.html.trim()) return null;
  const n = importNetscape(r.html, into);
  refreshAll();
  return n;
}
function importFromBrowser(into){
  return new Promise(resolve => {
    const api = bookmarksApi();
    if(!api) return resolve(null);
    api.getTree(roots => {
      const box = F("Browser bookmarks", []);
      let n = 0;
      (function walk(nodes, folder){
        (nodes || []).forEach(nd => {
          if(nd.children){
            const sub = F((nd.title || "").trim() || "Folder", []);
            walk(nd.children, sub);
            if(sub.children.length){ sub.name = uniqueName(folder, sub.name); folder.children.push(sub); }
          } else if(nd.url && /^https?:/i.test(nd.url)){
            const l = L((nd.title || "").trim() || nd.url, nd.url);
            l.name = uniqueName(folder, l.name); folder.children.push(l); n++;
          }
        });
      })(roots && roots[0] ? roots[0].children : roots, box);
      if(n){
        box.name = uniqueName(into, box.name);
        (into.children = into.children || []).push(box);
        reindex(); save(); refreshAll();
      }
      resolve(n);
    });
  });
}
/* Must stay synchronous up to permissions.request — it needs the click's user gesture. */
function importBookmarks(into){
  const canAsk = AS_EXT && typeof chrome !== "undefined" && chrome.permissions && chrome.permissions.request;
  if(!canAsk){
    importFromPaste(into).then(n => { if(n != null) say("Imported " + n + " bookmark(s).", "Import bookmarks"); });
    return;
  }
  chrome.permissions.request({ permissions:["bookmarks"] }, granted => {
    if(granted && bookmarksApi()){
      importFromBrowser(into).then(n => {
        say(n ? "Imported " + n + " bookmark(s) into a new folder called “Browser bookmarks”."
              : "The browser reported no bookmarks to import.", "Import bookmarks");
      });
      return;
    }
    importFromPaste(into).then(n => { if(n != null) say("Imported " + n + " bookmark(s).", "Import bookmarks"); });
  });
}

/* ============================================================
   14. Help window
   ============================================================ */
function openHelp(){
  const ex = wins.find(w => w.kind === "help");
  if(ex){ focusWin(ex); return; }
  const w = makeWindow({ title:`Read Me — ${activeTheme.shortName}`, icon:ICONS.help, kind:"help", w:600, h:440 });
  const box = el("div","fields in"); box.style.background = "#fff"; box.style.userSelect = "text";
  box.innerHTML = `
    <h2 style="margin:0 0 6px;font-size:15px">${esc(activeTheme.shortName)}</h2>
    <div class="hint" style="margin-bottom:10px">A new tab page that behaves like a small classic desktop. Switch between Windows 95 and Mac OS 9 without changing your folders, notes, or apps.</div>
    <fieldset><legend>Desktop</legend>
      <div class="hint">
        • <b>Double-click</b> a folder to open a window; double-click a shortcut to go there.<br>
        • <b>Right-click</b> the desktop or inside a folder for <i>New Folder</i> / <i>New Shortcut</i>.<br>
        • <b>Drag</b> icons anywhere; drag items in a folder window onto another folder to move them.<br>
        • <b>MiniOS Today</b> keeps your daily folder and scratch pad close; hide or restore it in Settings.<br>
        • The <b>CRT screen effect</b> can be switched on or off under Settings → Appearance.<br>
        • <b>MiniEditor</b> adds line numbers, open/download, find and replace, language modes, word wrap and an autosaved document.<br>
        • Right-click any item for Rename, Move, Delete, Properties.
      </div>
    </fieldset>
    <fieldset><legend>Terminal</legend>
      <div class="hint">
        Pick your shell in Settings, or type <kbd>shell bash</kbd> / <kbd>shell zsh</kbd> / <kbd>shell powershell</kbd>.<br><br>
        <b>Getting around:</b> <kbd>ls</kbd> <kbd>cd Dev</kbd> <kbd>cd ..</kbd> <kbd>pwd</kbd> <kbd>tree</kbd><br>
        <b>Using links:</b> <kbd>open github</kbd> <kbd>cat github</kbd> <kbd>grep hacker</kbd> <kbd>search rust traits</kbd><br>
        <b>Editing:</b> <kbd>mkdir Recipes</kbd> <kbd>add Docs docs.claude.com</kbd> <kbd>mv old new</kbd> <kbd>rm -r Old</kbd><br>
        <b>Looks:</b> <kbd>wallpaper logo fit 45%</kbd> <kbd>wallpaper none</kbd> <kbd>wallpaper tile</kbd><br>
        <b>Extras:</b> <kbd>neofetch</kbd> <kbd>history</kbd> <kbd>notepad</kbd> <kbd>minieditor</kbd> <kbd>export</kbd> <kbd>import-browser</kbd> <kbd>help</kbd><br><br>
        PowerShell names work too — <kbd>Get-ChildItem</kbd>, <kbd>Set-Location</kbd>, <kbd>Remove-Item</kbd>, <kbd>cls</kbd>.
        <kbd>Tab</kbd> completes, <kbd>↑</kbd>/<kbd>↓</kbd> walks history, <kbd>Ctrl+L</kbd> clears.
      </div>
    </fieldset>
    <fieldset><legend>Shortcuts</legend>
      <div class="hint">
        ${AS_EXT ? `<b>Click the desktop once first.</b> A new tab opens with the cursor in the browser's address bar, so
        keystrokes go there, not here — that is the browser's behaviour and a page cannot take the focus back.<br><br>` : ``}
        <kbd>Ctrl</kbd>+<kbd>\`</kbd> new terminal · <kbd>Ctrl</kbd>+<kbd>K</kbd> focus search · <kbd>Ctrl</kbd>+<kbd>E</kbd> ${esc(activeTheme.computerName)} ·
        <kbd>Esc</kbd> close menus · <kbd>F2</kbd> settings
      </div>
    </fieldset>
    <fieldset><legend>${AS_EXT ? "Where this is running" : "Make this your new tab and home page"}</legend>
      <div class="hint" id="helpwhere"></div>
    </fieldset>`;
  const where = box.querySelector("#helpwhere");
  const here = location.href.replace(/#.*$/,"");
  if(AS_EXT){
    where.innerHTML =
      `Loaded as the <b>${esc(activeTheme.shortName)}</b> extension, so it already replaces <b>every new tab</b>.<br><br>` +
      `To use it for the <b>Home button</b> and on <b>startup</b> too, paste this address into those settings:<br>` +
      `<code style="user-select:all">${esc(here)}</code><br><br>` +
      `<b>Edge:</b> Settings → Start, home, and new tabs.  <b>Chrome / Brave:</b> Settings → On startup, and Appearance → Show home button.<br><br>` +
      `Not shown on <b>incognito</b> new tabs — browsers always use their own page there.<br><br>` +
      `Your folders live in this extension's storage, which survives browser restarts, browser updates, and moving the ` +
      `folder on disk (the extension ID is pinned in <code>manifest.json</code>). <b>Removing the extension erases it</b>, ` +
      `and so does loading a copy that has no <code>key</code> — keep a backup with <i>Export</i> in Settings.`;
  } else {
    where.innerHTML =
      `Running as a plain file, so it is <b>not</b> your new tab yet — a page can only take over the new tab as an extension. ` +
      `The folder this file sits in is already a loadable extension: open <code>edge://extensions</code> (or <code>chrome://extensions</code>), ` +
      `turn on <b>Developer mode</b>, click <b>Load unpacked</b>, and pick that folder.<br><br>` +
      `For the Home button and startup pages, paste this address:<br><code style="user-select:all">${esc(here)}</code><br>` +
      `<b>Edge:</b> Settings → Start, home, and new tabs.  <b>Chrome / Brave:</b> Settings → On startup, and Appearance → Show home button.<br><br>` +
      `Anything you add is stored per address, so the file and the extension keep <b>separate</b> sets. ` +
      `If you build folders here and then install the extension, carry them over with <i>Export</i> here and <i>Import</i> there.`;
  }
  w.body.appendChild(box);
  return w;
}

/* ============================================================
   15. Start menu
   ============================================================ */
function buildStart(){
  const list = $("#startlist"); list.innerHTML = "";
  const mkItem = (label: string, icon: string, action?: (() => unknown) | null, sub?: ((menu: HTMLDivElement) => void) | null) => {
    const d = el("div","mi");
    const i = el("img"); i.src = icon; i.alt = "";
    d.append(i, el("span",null,label));
    if(sub){
      d.appendChild(el("span","arrow","▶"));
      const s = el("div","submenu out");
      sub(s);
      d.appendChild(s);
    } else if(action){
      d.onclick = () => { hideMenus(); action(); };
    }
    return d;
  };
  list.appendChild(mkItem(activeTheme.menu.applications, ICONS.computer, null, s => {
    ([['Terminal — PowerShell', ICONS.terminal, ()=>openTerminal("powershell")],
     ["Terminal — Bash", ICONS.bash, ()=>openTerminal("bash")],
     ["Terminal — Zsh", ICONS.zsh, ()=>openTerminal("zsh")],
     ["Notepad", ICONS.notepad, ()=>openNotepad("welcome")],
     ["MiniEditor", ICONS.npp, ()=>openMiniEditor()],
     [activeTheme.computerName, ICONS.computer, ()=>openExplorer(state.fs)]
    ] as Array<[string,string,()=>unknown]>).forEach(([l,ic,a]) => s.appendChild(mkItem(l, ic, a)));
  }));
  list.appendChild(mkItem(activeTheme.menu.favorites, ICONS.folder, null, s => {
    const kids = (state.fs.children||[]);
    if(!kids.length) s.appendChild(mkItem("(empty)", ICONS.folder, null));
    kids.forEach(n => {
      if(isFolder(n)){
        s.appendChild(mkItem(n.name, ICONS.folder, null, s2 => {
          const items = n.children || [];
          if(!items.length) s2.appendChild(mkItem("(empty)", ICONS.link, null));
          items.forEach(c => s2.appendChild(mkItem(c.name, iconFor(c), () => openNode(c))));
        }));
      } else s.appendChild(mkItem(n.name, ICONS.link, () => go(n.url)));
    });
  }));
  list.appendChild(mkItem(activeTheme.menu.settings, ICONS.settings, ()=>openSettings()));
  list.appendChild(mkItem("Find…", ICONS.find, ()=>{ const query = $<HTMLInputElement>("#q"); query.focus(); query.select(); }));
  list.appendChild(mkItem("Help", ICONS.help, ()=>openHelp()));
  list.appendChild(mkItem("Run…", ICONS.run, async ()=>{
    const r = await dialog({ title:"Run", msgIcon:ICONS.run,
      message:`Type a command, a bookmark name or an address, and ${activeTheme.shortName} will open it.`,
      fields:[{key:"cmd",label:"Open:",value:""}] });
    if(!r || !r.cmd.trim()) return;
    const v = r.cmd.trim();
    if(looksLikeUrl(v)) return go(v);
    const n = resolve(v, state.fs);
    if(n) return openNode(n);
    const S = openTerminal();
    setTimeout(()=>{ S.out(''); runCommand(S, v); S.refreshPrompt(); }, 60);
  }));
  list.appendChild(el("div","mdiv"));
  list.appendChild(mkItem(activeTheme.menu.shutdown, ICONS.shutdown, async ()=>{
    if(await ask(`Are you sure you want to shut down ${activeTheme.shortName}?`,activeTheme.menu.shutdown.replace("…",""))) $("#shutdown").classList.add("open");
  }));
}
$("#start").onclick = e => {
  e.stopPropagation();
  const m = $("#startmenu");
  const open = m.classList.toggle("open");
  $("#start").classList.toggle("pressed", open);
  if(open){ buildStart(); m.style.zIndex = String(++zTop); }
};
$("#shutdown").onclick = () => $("#shutdown").classList.remove("open");

/* ============================================================
   16. Omnibar, clock, chrome, shortcuts
   ============================================================ */
$("#omniform").addEventListener("submit", e => {
  e.preventDefault();
  const query = $<HTMLInputElement>("#q");
  const v = query.value.trim();
  if(!v) return;
  if(looksLikeUrl(v)) return go(v);
  const n = resolve(v, state.fs);
  if(n){ openNode(n); query.value = ""; return; }
  go(searchUrl(v));
});
$("#omniterm").onclick = () => openTerminal();

const TODAY_TIPS = [
  "Start typing anywhere on the desktop to search.",
  "Double-click a folder to browse your favorite places.",
  "Press Ctrl+` to open a terminal in a flash.",
  "Right-click the desktop to add a folder or shortcut.",
  "Use Ctrl+E to open My Computer from anywhere.",
  "Your Scratch Pad is saved automatically in this browser.",
  "Click the shell badge by the clock to change terminals."
];
const TIPS_PER_DAY = 3;
const WEEKDAY_STATUS = [
  "Sunday pace. Take it easy.",
  "Monday reset. A fresh week begins.",
  "Tuesday momentum is building.",
  "Wednesday — halfway through.",
  "Thursday. The weekend is in sight.",
  "Friday finish line.",
  "Saturday mode. No rush."
];
function displayName(name){
  const clean = String(name || "friend").replace(/[._-]+/g," ").trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "Friend";
}
function dayOfYear(d){
  return Math.floor((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()) - Date.UTC(d.getFullYear(),0,0)) / 86400000);
}
function isoWeek(d){
  const u = new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const weekday = u.getUTCDay() || 7;
  u.setUTCDate(u.getUTCDate() + 4 - weekday);
  const yearStart = new Date(Date.UTC(u.getUTCFullYear(),0,1));
  return Math.ceil((((u.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
function updateToday(d){
  const h = d.getHours();
  const greeting = h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const year = d.getFullYear();
  const todayNumber = dayOfYear(d);
  const daysThisYear = new Date(year,1,29).getMonth() === 1 ? 366 : 365;
  const yearPercent = Math.round((todayNumber / daysThisYear) * 100);
  const tomorrow = new Date(year,d.getMonth(),d.getDate()+1);
  $("#today-greeting").textContent = greeting + ", " + displayName(state.user) + ".";
  $("#today-cal-weekday").textContent = d.toLocaleDateString(undefined,{ weekday:"short" });
  $("#today-cal-day").textContent = String(d.getDate());
  $("#today-date").textContent = d.toLocaleDateString(undefined,{ month:"long", year:"numeric" });
  $("#today-week").textContent = "Week " + isoWeek(d) + " · Day " + todayNumber + " of " + daysThisYear;
  $("#today-tomorrow").textContent = "Tomorrow: " + tomorrow.toLocaleDateString(undefined,{ weekday:"short", month:"short", day:"numeric" });
  $("#today-year-label").textContent = String(year);
  $("#today-year-progress").style.width = yearPercent + "%";
  $("#today-year-percent").textContent = yearPercent + "%";
  $("#today-status-text").textContent = WEEKDAY_STATUS[d.getDay()];
  const firstTip = ((todayNumber - 1) * TIPS_PER_DAY) % TODAY_TIPS.length;
  $("#today-tips").replaceChildren(...Array.from({length:TIPS_PER_DAY},(_,i) => {
    const item = document.createElement("li");
    item.textContent = TODAY_TIPS[(firstTip + i) % TODAY_TIPS.length];
    return item;
  }));
}

$("#today-close").onclick = () => { state.showToday = false; save(); applyChrome(); };
$("#today-daily").onclick = () => {
  const daily = findChild(state.fs,"Daily");
  openExplorer(isFolder(daily) ? daily : state.fs);
};
$("#today-note").onclick = () => openNotepad("welcome");

function clock(){
  const d = new Date();
  const h = d.getHours(), ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  $("#clock").textContent = h12 + ":" + two(d.getMinutes()) + " " + ampm;
  $("#clock").title = d.toDateString();
  $("#tray-date").textContent = (d.getMonth()+1) + "/" + d.getDate() + "/" + String(d.getFullYear()).slice(-2);
  updateToday(d);
}
setInterval(clock, 10000); clock();

/* Wallpaper, Win95-style: Fit, Centre, Tile or Stretch over the desktop colour. */
const WALL_MODES = {
  /* fit scales to a share of the desktop height, keeping the aspect ratio */
  fit:     { size:() => "auto " + Math.max(5, Math.min(100, Number(state.wallpaperSize) || 45)) + "%",
             repeat:"no-repeat", position:"center center", sized:true },
  center:  { size:"auto",    repeat:"no-repeat", position:"center center" },
  tile:    { size:"auto",    repeat:"repeat",    position:"left top" },
  stretch: { size:"cover",   repeat:"no-repeat", position:"center center" }
};
function rgba(hex, a){
  const h = String(hex).replace("#","");
  const n = parseInt(h.length === 3 ? h.split("").map(c=>c+c).join("") : h, 16);
  return "rgba(" + ((n>>16)&255) + "," + ((n>>8)&255) + "," + (n&255) + "," + a.toFixed(3) + ")";
}
function applyWallpaper(){
  const d = $("#desktop");
  const src = (state.wallpaper || "").trim();
  d.style.backgroundColor = state.desktopColor;
  if(!src){ d.style.backgroundImage = "none"; return; }

  const m = WALL_MODES[state.wallpaperMode] || WALL_MODES.fit;
  const mSize = typeof m.size === "function" ? m.size() : m.size;
  const url = 'url("' + src.replace(/"/g, "%22") + '")';
  const f = Math.max(0, Math.min(100, Number(state.wallpaperFade))) / 100;
  /* a veil of the desktop colour on top of the artwork, so it can sit back a little */
  const veil = f >= 1 ? "" : "linear-gradient(" + rgba(state.desktopColor, 1 - f) + "," + rgba(state.desktopColor, 1 - f) + ")";

  d.style.backgroundImage    = veil ? veil + ", " + url : url;
  d.style.backgroundSize     = veil ? "auto, "   + mSize      : mSize;
  d.style.backgroundRepeat   = veil ? "repeat, " + m.repeat   : m.repeat;
  d.style.backgroundPosition = veil ? "center, " + m.position : m.position;
}
function applyChrome(){
  activeTheme = themeFor(state.appearance);
  ICONS = activeTheme.icons;
  WALLPAPER_PRESETS = activeTheme.wallpapers;
  applyThemeIdentity(activeTheme);
  document.documentElement.style.setProperty("--desktop", state.desktopColor);
  document.body.classList.toggle("crt-on", state.crtEffect !== false);
  $("#shellbadge").textContent = SHELLS[state.shell].short;
  $("#shellbadge").title = "Default shell: " + SHELLS[state.shell].label;
  $("#omni").style.display = state.showOmni ? "" : "none";
  $("#today").style.display = state.showToday ? "" : "none";
  const activeEngine = ENGINES[state.engine] || ENGINES.duckduckgo;
  $("#engine-label").textContent = "Search powered by " + activeEngine.name;
  const startButton = $<HTMLButtonElement>("#start");
  const si = startButton.querySelector<HTMLImageElement>("img");
  const startLabel = startButton.querySelector<HTMLSpanElement>("span");
  startButton.title = activeTheme.launcherTitle;
  startButton.setAttribute("aria-label", activeTheme.launcherTitle);
  if(startLabel) startLabel.textContent = activeTheme.launcherLabel;
  if(!si) throw new Error("The desktop launcher icon is missing.");
  si.src = ICONS.win;
  si.style.display = "";
  si.onerror = () => { si.style.display = "none"; };   // artwork missing: keep the button usable
  const shutdownMessage = document.querySelector<HTMLElement>("#shutdown-message");
  if(shutdownMessage) shutdownMessage.textContent = state.appearance === "macos9" ? "Your Macintosh is now ready to shut down." : "It’s now safe to turn off your computer.";
  applyWallpaper();
}
function refreshWindowIcons(){
  const iconsByKind = {
    explorer: ICONS.folderOpen,
    notepad: ICONS.notepad,
    npp: ICONS.npp,
    settings: ICONS.settings,
    help: ICONS.help
  };
  wins.forEach(w => {
    const nextIcon = iconsByKind[w.kind];
    if(nextIcon){ w.icon = nextIcon; w.iconEl.src = nextIcon; }
    if(w.kind === "help") w.setTitle(`Read Me — ${activeTheme.shortName}`);
  });
  syncTasks();
}
function refreshAll(){
  renderIcons();
  explorers.forEach(x => x.render());
}
$("#shellbadge").onclick = () => {
  const order: MiniOSState["shell"][] = ["powershell","bash","zsh"];
  state.shell = order[(order.indexOf(state.shell)+1) % 3];
  save(); applyChrome();
};

document.addEventListener("keydown", e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if(e.key === "Escape"){ hideMenus(); return; }
  if(e.ctrlKey && e.key === "`"){ e.preventDefault(); openTerminal(); return; }
  if(e.ctrlKey && (e.key === "k" || e.key === "K")){ e.preventDefault(); const query = $<HTMLInputElement>("#q"); query.focus(); query.select(); return; }
  if(e.ctrlKey && (e.key === "e" || e.key === "E")){ e.preventDefault(); openExplorer(state.fs); return; }
  if(e.key === "F2" && !typing){ e.preventDefault(); openSettings(); return; }
  if(!typing && !e.ctrlKey && !e.altKey && !e.metaKey && /^[a-z0-9]$/i.test(e.key) && state.showOmni){
    $("#q").focus(); // start typing anywhere to search
  }
});
let rz = null;
window.addEventListener("resize", () => {
  clearTimeout(rz); rz = setTimeout(renderIcons, 150);
  wins.forEach(w => {
    if(w.max) Object.assign(w.node.style, { width:desktop.clientWidth+"px", height:desktop.clientHeight+"px" });
    w.node.style.left = Math.min(w.node.offsetLeft, Math.max(0, desktop.clientWidth - 60)) + "px";
    w.node.style.top  = Math.min(w.node.offsetTop, Math.max(0, desktop.clientHeight - 24)) + "px";
  });
});

/* ============================================================
   17. Boot
   ============================================================ */
const BOOT = Date.now();
applyChrome();
renderIcons();
save();
try{
  if(!(await stateStore.hasSeenOnboarding())){
    await stateStore.markOnboardingSeen();
    setTimeout(openHelp, 250);
  }
}catch(e){ /* storage blocked (private mode / file restrictions) — carry on */ }

document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "hidden") void stateStore.save(state);
});
}

void boot().catch(error => {
  console.error("MiniOS could not start", error);
  document.body.innerHTML = `<main class="boot-error"><h1>MiniOS could not start</h1><p>${esc(error instanceof Error ? error.message : error)}</p></main>`;
});
