// Prints the node tree, triangle counts, materials and animations of glTF files (asset selection helper).
//   node tools/inspect-glb.mjs a.glb b.gltf ...
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  const r = doc.getRoot();
  console.log('==', f.split('/').pop(), 'anims', r.listAnimations().map((a) => a.getName()).join(','),
    'tex', r.listTextures().map((t) => t.getName() + ':' + t.getImage()?.byteLength).join(','));
  for (const n of r.listNodes()) {
    const m = n.getMesh();
    let tris = 0;
    if (m) for (const p of m.listPrimitives()) tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
    console.log('  ', n.getName(), n.getTranslation().map((v) => v.toFixed(2)).join(','),
      m ? 'tris ' + tris + ' mats ' + m.listPrimitives().map((p) => p.getMaterial()?.getName()).join('|') : '', 'children', n.listChildren().length);
  }
}
