import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),"..");
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const app=fs.readFileSync(path.join(root,"src/App.tsx"),"utf8");
const main=fs.readFileSync(path.join(root,"src/main.tsx"),"utf8");
const boundary=fs.readFileSync(path.join(root,"src/components/system/AppErrorBoundary.tsx"),"utf8");

assert.match(html,/<html[^>]*translate="no"[^>]*class="notranslate"/i);
assert.match(html,/<meta\s+name="google"\s+content="notranslate"\s*\/?>/i);
assert.match(html,/<body[^>]*translate="no"[^>]*class="notranslate"/i);
assert.match(app,/data-be-app-shell="true"[\s\S]{0,160}notranslate[\s\S]{0,160}translate="no"/);
assert.match(main,/document\.documentElement\.setAttribute\("translate",\s*"no"\)/);
assert.match(boundary,/isDomMutationError/);
assert.match(boundary,/removeChild|insertBefore|not a child/i);
console.log("DOM translation crash shield V134 contract PASS");
