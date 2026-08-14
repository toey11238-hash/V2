const { probeLinuxThirdPartySandbox } = await import('../packages/plugins/src/external.ts');
const result = await probeLinuxThirdPartySandbox();
console.log(JSON.stringify(result, null, 2));
if (process.argv.includes('--enforce') && !result.verified) process.exitCode = 1;
