/* eslint-disable @typescript-eslint/no-require-imports -- 장면 검증용 Node CommonJS 진입점 */
/* 장면 단독 검증 서버: 앱 인증이나 API를 우회하지 않는다. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const threeRoot = path.dirname(require.resolve('three'));
http
  .createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    response.setHeader('Content-Type', 'text/javascript');
    if (url.pathname.startsWith('/lib/')) {
      const filename = path.join(root, `${url.pathname}.ts`);
      if (!fs.existsSync(filename)) {
        response.writeHead(404);
        response.end();
        return;
      }
      const source = fs.readFileSync(filename, 'utf8');
      response.end(
        ts.transpileModule(source, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText,
      );
      return;
    }
    if (url.pathname.startsWith('/three/')) {
      const filename = path.join(threeRoot, path.basename(url.pathname));
      response.end(fs.readFileSync(filename));
      return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#e7f7f5}canvas{display:block;width:100%;height:100%;touch-action:none}#stage{width:${Number(url.searchParams.get('width')) || 600}px;height:${Number(url.searchParams.get('height')) || 460}px}</style><script type="importmap">{"imports":{"three":"/three/three.module.js"}}</script><div id="stage"><canvas></canvas></div><output></output><script type="module">
import {createConchScene} from '/lib/sceneRenderer';
let disabled=false, pulls=0;
const canvas=document.querySelector('canvas');
window.sceneTest={setDisabled(value){disabled=value;controller.syncState()},get pulls(){return pulls}};
const controller=createConchScene(canvas,{getState:()=>({disabled,onPull(){pulls++;document.querySelector('output').textContent=String(pulls)}}),onReady(){document.body.dataset.ready='true'},onFailure(){document.body.dataset.failed='true';canvas.remove()}});
window.sceneTest.destroy=controller.destroy;
</script>`);
  })
  .listen(3217, '127.0.0.1', () => console.log('장면 검증 서버 http://127.0.0.1:3217'));
