import assert from 'node:assert/strict';
import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

async function walk(dir,root=dir,out=[]){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const path=join(dir,entry.name);if(entry.isDirectory())await walk(path,root,out);else out.push(path.slice(root.length+1));
  }
  return out;
}

test('licensed repository contains no client, KYC or mobile trees',async()=>{
  const files=await walk(fileURLToPath(new URL('..',import.meta.url)));
  for(const forbidden of ['app/h5/','app/mini/','lib/kyc/','mobile/'])assert.equal(files.some(file=>file.replaceAll('\\','/').startsWith(forbidden)),false,forbidden);
});
