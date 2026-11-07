import {defineConfig,globalIgnores} from 'eslint/config';
import nextTs from 'eslint-config-next/typescript';
export default defineConfig([...nextTs,{files:['lib/team/audit-writer.ts'],rules:{'@typescript-eslint/no-explicit-any':'off'}},globalIgnores(['.next/**','dist/**','build/**'])]);
