const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { importLegacyPackageData } = require('../legacy-package-data.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-package-migration-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const localAppData = path.join(root, 'local'), target = path.join(root, 'roaming', 'pet-with-you');
  const source = path.join(localAppData, 'Packages', 'Fixture.Editor_123', 'LocalCache', 'Roaming', 'DSH Pet Companion');
  fs.mkdirSync(source, { recursive: true });
  return { source, target, localAppData };
}
test('MSIX settings migration retains keys, fonts and launch settings but excludes runtime and login files', t => {
  const {source,target,localAppData}=fixture(t);
  for(const name of ['preferences.json','api-settings.json','client-launcher.local.json','connection.json','auth.json'])fs.writeFileSync(path.join(source,name),'{"fixture":true}');
  fs.mkdirSync(path.join(source,'fonts'));fs.writeFileSync(path.join(source,'fonts','fixture.ttf'),'fixture');
  assert.deepEqual(importLegacyPackageData(target,{localAppData}),{imported:true});
  for(const name of ['preferences.json','api-settings.json','client-launcher.local.json','fonts/fixture.ttf'])assert.deepEqual(fs.readFileSync(path.join(target,name)),fs.readFileSync(path.join(source,name)));
  for(const name of ['connection.json','auth.json'])assert.equal(fs.existsSync(path.join(target,name)),false);
  fs.writeFileSync(path.join(target,'preferences.json'),'{"current":true}');
  assert.deepEqual(importLegacyPackageData(target,{localAppData}),{imported:false});
  assert.equal(fs.readFileSync(path.join(target,'preferences.json'),'utf8'),'{"current":true}');
});
test('MSIX migration imports a unified settings vault together and keeps destination launch choices',t=>{
  const {source,target,localAppData}=fixture(t);
  for(const name of ['settings.json','credentials.local.json'])fs.writeFileSync(path.join(source,name),'{}');
  fs.writeFileSync(path.join(source,'client-launcher.local.json'),'old');
  fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'client-launcher.local.json'),'current');
  importLegacyPackageData(target,{localAppData});
  assert.ok(fs.existsSync(path.join(target,'credentials.local.json')));
  assert.equal(fs.readFileSync(path.join(target,'client-launcher.local.json'),'utf8'),'current');
  assert.ok(fs.existsSync(path.join(source,'settings.json')),'legacy source remains a rollback copy');
});
test('multiple MSIX sources are not silently mixed or chosen arbitrarily',t=>{
  const {source,target,localAppData}=fixture(t);
  fs.writeFileSync(path.join(source,'preferences.json'),'{}');
  const other=source.replace('Fixture.Editor_123','Fixture.Other_456');fs.mkdirSync(other,{recursive:true});fs.writeFileSync(path.join(other,'preferences.json'),'{}');
  assert.throws(()=>importLegacyPackageData(target,{localAppData}),/多份/);
  assert.equal(fs.existsSync(target),false);
});

test('ordinary legacy directory takes precedence, migrating custom pets, fonts and vault without runtime state',t=>{
  const {target,localAppData,source:msix}=fixture(t);
  const source=path.join(path.dirname(target),'DSH Pet Companion');fs.mkdirSync(source,{recursive:true});
  fs.writeFileSync(path.join(msix,'settings.json'),'{}');
  for(const name of ['settings.json','credentials.local.json','connection.json','auth.json'])fs.writeFileSync(path.join(source,name),'{}');
  for(const name of ['pet/custom-animation/webm/demo.webm','main-animation/webm/demo.webm','fonts/custom.ttf','logs/errors.jsonl']){
    const file=path.join(source,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'fixture');
  }
  assert.deepEqual(importLegacyPackageData(target,{localAppData}),{imported:true});
  for(const name of ['settings.json','credentials.local.json','pet/custom-animation/webm/demo.webm','main-animation/webm/demo.webm','fonts/custom.ttf','logs/errors.jsonl'])assert.deepEqual(fs.readFileSync(path.join(target,name)),fs.readFileSync(path.join(source,name)));
  for(const name of ['connection.json','auth.json','.migration.lock','.migration-stage','.migration-pending.json'])assert.equal(fs.existsSync(path.join(target,name)),false);
  assert.deepEqual(importLegacyPackageData(target,{localAppData}),{imported:false});
});

test('live old process and conflicting destination vault prevent unsafe migration',t=>{
  const {target,localAppData,source}=fixture(t);
  fs.writeFileSync(path.join(source,'settings.json'),'{}');fs.writeFileSync(path.join(source,'credentials.local.json'),'{}');
  fs.writeFileSync(path.join(source,'connection.json'),JSON.stringify({pid:process.pid}));
  assert.throws(()=>importLegacyPackageData(target,{localAppData}),/仍在运行/);
  fs.unlinkSync(path.join(source,'connection.json'));
  fs.writeFileSync(path.join(target,'credentials.local.json'),'existing');
  assert.throws(()=>importLegacyPackageData(target,{localAppData}),/未混合/);
  assert.equal(fs.readFileSync(path.join(target,'credentials.local.json'),'utf8'),'existing');
  assert.equal(fs.existsSync(path.join(target,'settings.json')),false);
});

test('interrupted import resumes commit before accepting an existing settings marker',t=>{
  const {target,localAppData}=fixture(t);
  fs.mkdirSync(path.join(target,'.migration-stage'),{recursive:true});
  fs.writeFileSync(path.join(target,'settings.json'),'{}');
  fs.writeFileSync(path.join(target,'.migration-stage','credentials.local.json'),'vault');
  fs.writeFileSync(path.join(target,'.migration-pending.json'),JSON.stringify({entries:['settings.json','credentials.local.json']}));
  assert.deepEqual(importLegacyPackageData(target,{localAppData}),{imported:true});
  assert.equal(fs.readFileSync(path.join(target,'credentials.local.json'),'utf8'),'vault');
  assert.equal(fs.existsSync(path.join(target,'.migration-pending.json')),false);
});

test('fresh directory needs no migration; current destination settings are never overwritten',t=>{
  const {target,source,localAppData}=fixture(t);
  assert.deepEqual(importLegacyPackageData(target,{localAppData}),{imported:false});
  fs.writeFileSync(path.join(source,'settings.json'),'old');fs.mkdirSync(target,{recursive:true});fs.writeFileSync(path.join(target,'settings.json'),'current');
  assert.deepEqual(importLegacyPackageData(target,{localAppData}),{imported:false});
  assert.equal(fs.readFileSync(path.join(target,'settings.json'),'utf8'),'current');
});

test('failed commit leaves a resumable transaction with original vault and settings paired',t=>{
  const {target,source,localAppData}=fixture(t);
  fs.writeFileSync(path.join(source,'settings.json'),'settings');fs.writeFileSync(path.join(source,'credentials.local.json'),'vault');
  const rename=fs.renameSync;
  const mock=t.mock.method(fs,'renameSync',(from,to)=>{
    if(from===path.join(target,'.migration-stage','settings.json'))throw new Error('fixture write failure');
    return rename(from,to);
  });
  assert.throws(()=>importLegacyPackageData(target,{localAppData}),/fixture write failure/);mock.mock.restore();
  assert.ok(fs.existsSync(path.join(target,'.migration-pending.json')));
  assert.equal(fs.existsSync(path.join(target,'.migration.lock')),false);
  assert.deepEqual(importLegacyPackageData(target,{localAppData}),{imported:true});
  assert.equal(fs.readFileSync(path.join(target,'settings.json'),'utf8'),'settings');
  assert.equal(fs.readFileSync(path.join(target,'credentials.local.json'),'utf8'),'vault');
  assert.equal(fs.readFileSync(path.join(source,'credentials.local.json'),'utf8'),'vault');
});

test('migration lock protects another importer and is recovered after process exit',t=>{
  const {target,source,localAppData}=fixture(t);
  fs.writeFileSync(path.join(source,'settings.json'),'{}');fs.mkdirSync(target,{recursive:true});
  fs.writeFileSync(path.join(target,'.migration.lock'),JSON.stringify({pid:process.pid}));
  assert.throws(()=>importLegacyPackageData(target,{localAppData}),/另一桌宠/);
  assert.deepEqual(importLegacyPackageData(target,{localAppData,running:()=>false}),{imported:true});
});
