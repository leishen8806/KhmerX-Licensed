import assert from 'node:assert/strict';
import {access,readdir,writeFile,unlink,mkdir,rm} from 'node:fs/promises';
import {dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

async function walk(dir,root=dir,out=[]){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,entry.name);if(entry.isDirectory())await walk(path,root,out);else out.push(relative(root,path));
  }
  return out;
}

test('licensed repository contains no client, KYC or mobile trees',async()=>{
  const files=await walk(fileURLToPath(new URL('..',import.meta.url)));
  for(const forbidden of ['app/h5/','app/mini/','lib/kyc/','lib/postloan/','lib/notifications/','mobile/'])assert.equal(files.some(file=>file.replaceAll('\\','/').startsWith(forbidden)),false,forbidden);
  assert.equal(files.some(file=>file.replaceAll('\\','/').startsWith('app/team/')&&!file.replaceAll('\\','/').startsWith('app/team/login/')),false,'app/team outside login');
  assert.equal(files.some(file=>file.replaceAll('\\','/').startsWith('components/mini-')),false,'components/mini-*');
});

test('licensed boundary rejects a KYC file even when its path shares a prefix',async()=>{
  const root=fileURLToPath(new URL('..',import.meta.url)),path=join(root,'lib','kyc','x.ts');
  let ownedDir=false;
  try {await access(dirname(path));} catch {ownedDir=true;}
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path,'export const synthetic=true;');
  try {
    const files=await walk(root);
    assert.equal(files.map(file=>file.replaceAll('\\','/')).some(file=>file.startsWith('lib/kyc/')),true);
  } finally {await unlink(path);if(ownedDir)await rm(dirname(path),{recursive:true,force:true});}
});
