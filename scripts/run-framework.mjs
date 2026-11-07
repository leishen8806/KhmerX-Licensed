import {fileURLToPath,pathToFileURL} from 'node:url';
const [command,...args]=process.argv.slice(2);
if(!['build','dev'].includes(command))throw new Error('Expected build or dev.');
const cli=fileURLToPath(new URL('../node_modules/vinext/dist/cli.js',import.meta.url));
process.argv=[process.execPath,cli,command,...args];
await import(pathToFileURL(cli).href);
