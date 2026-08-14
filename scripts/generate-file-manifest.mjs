import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const root=resolve(process.cwd());
const output=resolve(root,'FILE_MANIFEST.md');
const excludedDirs=new Set(['.git','.tmp','node_modules','dist','build','.cache','coverage']);
const excludedFiles=new Set(['FILE_MANIFEST.md']);

async function walk(dir){
  const entries=await readdir(dir,{withFileTypes:true});
  const files=[];
  for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))){
    if(entry.isDirectory()&&excludedDirs.has(entry.name))continue;
    const full=resolve(dir,entry.name);
    if(entry.isDirectory())files.push(...await walk(full));
    else if(entry.isFile()&&!excludedFiles.has(entry.name))files.push(full);
  }
  return files;
}

const files=await walk(root);
const rows=[];
for(const file of files){
  const info=await stat(file);
  rows.push({path:relative(root,file).split(sep).join('/'),size:info.size});
}
rows.sort((a,b)=>a.path.localeCompare(b.path));
const day=new Date().toISOString().slice(0,10);
const body=[
  '# FILE MANIFEST','',`Generated: ${day}`,'',`Files tracked in workspace manifest: ${rows.length}`,'',
  '> Generated from the actual workspace. `.git`, `.tmp`, `node_modules`, build outputs and the manifest itself are excluded.','',
  ...rows.map((row)=>`- \`${row.path}\` - ${row.size} bytes`),'',
].join('\n');
await writeFile(output,body,'utf8');
console.log(`FILE_MANIFEST generated: ${rows.length} files`);
