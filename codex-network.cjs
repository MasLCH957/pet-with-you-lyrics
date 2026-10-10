const {execFile}=require('node:child_process');

function readWindowsProxy(){
  return new Promise(resolve=>{
    const script="$p=Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -ErrorAction Stop; @{enabled=($p.ProxyEnable -eq 1);server=$p.ProxyServer;bypass=$p.ProxyOverride;pac=$p.AutoConfigURL} | ConvertTo-Json -Compress";
    execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:3000,maxBuffer:16384},(error,stdout)=>{
      try{resolve(error?null:JSON.parse(stdout));}catch{resolve(null);}
    });
  });
}
function proxyUrl(value){
  if(!value)return null;
  try{
    const url=new URL(value.includes('://')?value:'http://'+value);
    if(!['http:','https:','socks5:','socks5h:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/'&&url.pathname!=='')return null;
    return url.href.replace(/\/$/,'');
  }catch{return null;}
}
function bypassList(value){
  const hosts=['localhost','127.0.0.1','::1'];
  for(let host of String(value||'').split(';').map(s=>s.trim()).filter(Boolean)){
    if(host==='<local>')continue;
    if(host==='*'){hosts.push(host);continue;}
    if(host.startsWith('*.'))host=host.slice(1);
    const subnet=host.match(/^(\d+)\.(?:(\d+)\.)?(?:(\d+)\.)?\*$/);
    if(subnet){const parts=subnet.slice(1).filter(Boolean);if(parts.every(p=>+p<=255))host=parts.concat(Array(4-parts.length).fill('0')).join('.')+'/'+parts.length*8;}
    if(!/[\s;*<>]/.test(host))hosts.push(host);
  }
  return [...new Set(hosts)].join(',');
}
async function codexEnvironment({env=process.env,platform=process.platform,readProxy=readWindowsProxy}={}){
  const next={...env};
  // Explicit process proxy settings take precedence. Never modify the parent's environment.
  if(Object.entries(env).some(([k,v])=>/^(https?|all)_proxy$/i.test(k)&&v))return {env:next,proxyMode:'environment'};
  if(platform!=='win32')return {env:next,proxyMode:'direct'};
  const settings=await readProxy().catch(()=>null);
  if(!settings)return {env:next,proxyMode:'unavailable'};
  if(settings.pac)return {env:next,proxyMode:'pac'};
  if(!settings.enabled||!settings.server)return {env:next,proxyMode:'direct'};
  const values={};
  for(const part of String(settings.server).split(';')){
    const match=part.trim().match(/^(http|https|socks)=(.+)$/i);
    if(match)values[match[1].toLowerCase()]=match[2];else if(!part.includes('='))values.all=part.trim();
  }
  const all=values.all||(values.socks?'socks5h://'+values.socks:null);
  const http=proxyUrl(values.http||all),https=proxyUrl(values.https||all);
  if(http)next.HTTP_PROXY=http;
  if(https)next.HTTPS_PROXY=https;
  if(!http&&!https)return {env:next,proxyMode:'unavailable'};
  const oldBypass=Object.entries(env).find(([k])=>/^no_proxy$/i.test(k))?.[1];
  for(const key of Object.keys(next))if(/^no_proxy$/i.test(key))delete next[key];
  next.NO_PROXY=[oldBypass,bypassList(settings.bypass)].filter(Boolean).join(',');
  return {env:next,proxyMode:'system'};
}
module.exports={codexEnvironment,bypassList};
