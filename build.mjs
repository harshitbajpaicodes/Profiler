// build.mjs — compile app.jsx -> app.js (JSX only, no polyfills). Node 18+.
//   node build.mjs
// Self-contained: fetches @babel/standalone, so no npm install / node_modules.
import fs from "node:fs";
import { createRequire } from "node:module";

const BABEL = "https://unpkg.com/@babel/standalone@7.24.7/babel.min.js";
const src = fs.readFileSync(new URL("./app.jsx", import.meta.url), "utf8");

const babelText = await (await fetch(BABEL)).text();
const tmp = new URL("./.babel.tmp.cjs", import.meta.url);
fs.writeFileSync(tmp, babelText);
const Babel = createRequire(import.meta.url)("./.babel.tmp.cjs");
fs.rmSync(tmp);

const { code } = Babel.transform(src, { presets: ["react"] });
fs.writeFileSync(new URL("./app.js", import.meta.url), "/* generated from app.jsx by build.mjs — do not edit */\n" + code);
console.log("built app.js (" + code.length + " chars)");
