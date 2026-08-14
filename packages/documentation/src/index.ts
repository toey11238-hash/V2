import type { ServerBlueprint } from '@autoserver/setup';

export interface DocumentationSnapshotInput {
  projectName: string;
  generatedAt?: string;
  slashRoots: readonly string[];
  blueprints: readonly ServerBlueprint[];
  migrations: readonly string[];
  modules: readonly { key: string; label: string; domain: string; maturity: string }[];
  panelIds: readonly string[];
  blocked: readonly string[];
}
function safe(value:string):string{return value.replaceAll('|','\\|').replaceAll('\n',' ');}
function table(headers: string[], rows: string[][]): string { return `| ${headers.join(' | ')} |\n| ${headers.map(()=>'---').join(' | ')} |\n${rows.map((row)=>`| ${row.map(safe).join(' | ')} |`).join('\n')}`; }
export function generateOperatorReference(input: DocumentationSnapshotInput): string {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  return [`# ${input.projectName} - Generated Operator Reference`, '', `Generated: ${generatedAt}`, '', '## Command boundary', '', input.slashRoots.length ? input.slashRoots.map((root)=>`- \`${root}\``).join('\n') : '- none registered', '', '## Blueprints', '', table(['Key','Version','Complexity','Resources'], input.blueprints.map((item)=>[item.key,String(item.version),item.complexity,String(item.resources.length)])), '', '## Modules', '', table(['Key','Label','Domain','Maturity'], input.modules.map((item)=>[item.key,item.label,item.domain,item.maturity])), '', '## Managed panels', '', input.panelIds.map((id)=>`- \`${id}\``).join('\n'), '', '## Database migrations', '', input.migrations.map((name)=>`- \`${name}\``).join('\n'), '', '## Known blockers', '', input.blocked.length ? input.blocked.map((item)=>`- ${item}`).join('\n') : '- none recorded', '', '> Generated documentation is an index of repository state, not verification evidence. Canon/Registry/Test/Integration gates still apply.', ''].join('\n');
}

export function generateBlueprintTree(blueprint: ServerBlueprint): string {
  const parents = new Map<string, string[]>(); const roots: string[] = [];
  for (const resource of blueprint.resources) {
    if (resource.kind === 'ROLE') continue;
    if (!resource.parentKey) roots.push(resource.logicalKey);
    else { const list = parents.get(resource.parentKey) ?? []; list.push(resource.logicalKey); parents.set(resource.parentKey, list); }
  }
  const lines = [`SERVER ${blueprint.displayName}`];
  for (const [index, root] of roots.entries()) {
    const resource=blueprint.resources.find(item=>item.logicalKey===root); const children = parents.get(root) ?? [];
    lines.push(`${index===roots.length-1?'└──':'├──'} ${resource?.name??root} [${root}]`);
    for (const [childIndex, child] of children.entries()) { const target=blueprint.resources.find(item=>item.logicalKey===child); lines.push(`    ${childIndex===children.length-1?'└──':'├──'} ${target?.name??child} [${child}]`); }
  }
  return lines.join('\n');
}

export interface BlueprintReportInput { blueprint: ServerBlueprint; panelIds?: readonly string[]; generatedAt?: string; }
export function generateServerBlueprintReport(input:BlueprintReportInput):string{
  const {blueprint}=input; const generatedAt=input.generatedAt??new Date().toISOString();
  const resources=blueprint.resources;
  const roles=resources.filter(item=>item.kind==='ROLE');
  const categories=resources.filter(item=>item.kind==='CATEGORY');
  const text=resources.filter(item=>item.kind==='TEXT_CHANNEL');
  const forums=resources.filter(item=>item.kind==='FORUM_CHANNEL');
  const voice=resources.filter(item=>item.kind==='VOICE_CHANNEL');
  const channelRows=resources.filter(item=>!['ROLE','CATEGORY'].includes(item.kind)).map(item=>[item.logicalKey,item.name,item.kind,item.parentKey??'—',item.visibility??'INHERIT',item.module,item.required===false?'optional':'required']);
  const roleRows=roles.map(item=>[item.logicalKey,item.name,item.ownership,item.module,item.required===false?'optional':'required']);
  const categoryRows=categories.map(item=>[item.logicalKey,item.name,item.module,item.ownership]);
  return [
    `# SERVER BLUEPRINT — ${blueprint.displayName}`,'',
    `Generated: ${generatedAt}`,
    `Blueprint: \`${blueprint.key}\` v${blueprint.version}`,
    `Complexity: **${blueprint.complexity.toUpperCase()}**`,'',
    '## Summary','',
    table(['Metric','Count'],[['Categories',String(categories.length)],['Text channels',String(text.length)],['Forum channels',String(forums.length)],['Voice channels',String(voice.length)],['Roles',String(roles.length)],['Panels',String(input.panelIds?.length??0)],['Modules',String(blueprint.enabledModules.length)],['Total managed resources',String(resources.length)]]),'',
    '## Enabled modules','',blueprint.enabledModules.length?blueprint.enabledModules.map(key=>`- \`${key}\``).join('\n'):'- none','',
    '## Structure tree','', '```text',generateBlueprintTree(blueprint),'```','',
    '## Categories','',categoryRows.length?table(['Logical key','Name','Module','Ownership'],categoryRows):'- none','',
    '## Channels / forums / voice','',channelRows.length?table(['Logical key','Name','Kind','Parent','Visibility','Module','Requirement'],channelRows):'- none','',
    '## Roles','',roleRows.length?table(['Logical key','Name','Ownership','Module','Requirement'],roleRows):'- none','',
    '## Panel map','',input.panelIds?.length?input.panelIds.map(id=>`- \`${id}\``).join('\n'):'- no managed panels mapped','',
    '## Permission / visibility profile notes','',
    ...resources.filter(item=>item.visibility).map(item=>`- \`${item.logicalKey}\` → **${item.visibility}**`),
    '', '> This report describes desired managed state. Actual Discord state must still be scanned and verified before any mutation.', ''
  ].join('\n');
}
