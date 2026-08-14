import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SUPPORTED_LOCALES, localizationCoverage, resolveLocale } from '../packages/localization/src/index.ts';

let count=0;const assert=(condition,message)=>{if(!condition)throw new Error(`a11y-i18n-smoke FAIL: ${message}`);count++;};
const html=readFileSync('apps/dashboard/index.html','utf8');const css=readFileSync('apps/dashboard/src/styles.css','utf8');
assert(/<html\s+lang="[a-z-]+"/i.test(html),'dashboard HTML must declare a default language');
assert(css.includes(':focus-visible'),'keyboard focus treatment must exist');
assert(css.includes('prefers-reduced-motion: reduce'),'reduced-motion contract must exist');
assert(!/focus-visible[^\{]*\{[^\}]*outline:\s*none/i.test(css),'focus-visible must not remove outline without a replacement');
assert(css.includes('@media (max-width:'),'mobile breakpoint must exist');
const componentFiles=readdirSync('apps/dashboard/src/components').filter((name)=>name.endsWith('.tsx')).map((name)=>join('apps/dashboard/src/components',name));componentFiles.push('apps/dashboard/src/App.tsx');
for(const file of componentFiles){const source=readFileSync(file,'utf8');for(const match of source.matchAll(/<img\b[^>]*>/g)){assert(/\balt=/.test(match[0]),`${file} image must have alt text`);}}
const coverage=localizationCoverage();assert(SUPPORTED_LOCALES.includes('th'),'Thai locale contract must exist');assert(coverage.complete,'internal locale keysets must match exactly');assert(resolveLocale('en')==='th','presentation locale must fail closed to Thai');
const app=readFileSync('apps/dashboard/src/App.tsx','utf8');assert(app.includes("document.documentElement.lang='th'"),'runtime document language must be Thai');assert(!app.includes('aria-pressed={uiLocale'), 'Thai-only presentation must not expose an alternate locale selector');
const stage=readFileSync('apps/dashboard/src/components/RealtimeVisualStage.tsx','utf8');assert(stage.includes('prefers-reduced-motion: reduce')||css.includes('prefers-reduced-motion: reduce'),'realtime visuals must honor reduced motion');assert(stage.includes('aria-live'), 'realtime visual evidence must expose an aria-live region');
console.log(`a11y-i18n-smoke PASS ${count} assertions · static contract only, not browser E2E evidence`);
