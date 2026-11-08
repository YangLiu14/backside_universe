import {SplatMesh} from '@sparkjsdev/spark';

// Both exports use the raw Marble frame, including the source world's scale.
export async function loadMarbleRoom(url, semantics, onProgress) {
  const mesh = new SplatMesh({url, lod: false, onProgress});
  try {
    await mesh.initialized;
    mesh.scale.setScalar(semantics.metric_scale_factor);
    mesh.rotation.x = Math.PI;
    mesh.position.y = semantics.ground_plane_offset;
    return mesh;
  } catch (error) {
    mesh.dispose();
    throw error;
  }
}
