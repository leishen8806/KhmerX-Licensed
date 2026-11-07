import vinext from 'vinext';
import {cloudflare} from '@cloudflare/vite-plugin';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins:[vinext(),cloudflare({
    viteEnvironment:{name:'rsc',childEnvironments:['ssr']},inspectorPort:false,
    config:{main:'vinext/server/fetch-handler',compatibility_flags:['nodejs_compat'],d1_databases:[{binding:'DB',database_name:'licensed',database_id:'00000000-0000-4000-8000-000000000000'}]},
  })],
});
