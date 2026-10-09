const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const psString=s=>"'"+String(s).replaceAll("'","''")+"'";
function syncStartup({dataDir,preferences,executable,root,packaged=false,shortcutDir}){
  if(process.platform!=='win32'){
    if(preferences.autostart)throw new Error('开机启动目前仅支持 Windows');
    return;
  }
  const enabled=preferences.autostart;
  // Paths are generated on the current user's machine, never distributed in source.
  fs.writeFileSync(path.join(dataDir,'startup-target.json'),JSON.stringify({executable,root,packaged,...(!packaged&&process.env.PET_NODE_EXE?{nodeExecutable:process.env.PET_NODE_EXE}:{})}));
  const script=path.join(root,'startup-watch.ps1');
  const args=`-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${script}" -DataDir "${dataDir}"`;
  const folder=shortcutDir?psString(shortcutDir):"([Environment]::GetFolderPath('Startup'))";
  const legacyDataDir=path.join(path.dirname(dataDir),require('./project.cjs').LEGACY_DATA_DIRECTORY_NAME);
  const command=String.raw`
$ErrorActionPreference='Stop'
. ${psString(path.join(__dirname,'shell-shortcut.ps1'))}
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object {$_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine.Contains('startup-watch.ps1') -and $_.CommandLine.Contains(${psString('"'+dataDir+'"')})} | ForEach-Object {Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue}
$p=Join-Path ${folder} 'pet-with-you.lnk'
$old=Join-Path ${folder} 'DSH Pet Companion.lnk'
function Test-OwnedPetLink($file) {
  $link=New-PetShortcut $file
  return $link.Arguments.Contains(${psString('"'+script+'"')}) -or (($link.TargetPath -like '*\powershell.exe') -and ($link.Arguments -match '-File "[^"\r\n]+[\\/]startup-watch\.ps1"') -and ($link.Arguments.Contains(${psString('-DataDir "'+dataDir+'"')}) -or $link.Arguments.Contains(${psString('-DataDir "'+legacyDataDir+'"')})))
}
if(Test-Path -LiteralPath $p) {
  if(!(Test-OwnedPetLink $p)){throw 'Startup shortcut name is already used by another application.'}
}
if(${enabled?'$true':'$false'}) {
  $s=New-PetShortcut $p
  $s.TargetPath=Join-Path $PSHOME 'powershell.exe'
  $s.Arguments=${psString(args)}
  $s.WorkingDirectory=${psString(root)}
  $s.WindowStyle=7
  $s.Save()
} elseif(Test-Path -LiteralPath $p) {Remove-Item -LiteralPath $p}
if((Test-Path -LiteralPath $old) -and (Test-OwnedPetLink $old)){Remove-Item -LiteralPath $old}
`;
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',command],{windowsHide:true,stdio:'pipe'});
}
module.exports={syncStartup,psString};
