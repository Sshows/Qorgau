import { cp, mkdir } from 'node:fs/promises';
await mkdir('public/cesium', { recursive: true });
for (const directory of ['Assets', 'Workers', 'Widgets', 'ThirdParty']) {
  await cp(`node_modules/cesium/Build/Cesium/${directory}`, `public/cesium/${directory}`, { recursive: true });
}
