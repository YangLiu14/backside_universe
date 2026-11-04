"""Keep source-image segmentation boundaries separate during depth lifting.

Only reassign depths in a narrow observed silhouette band. This supplies no
hidden surface and modifies neither RGB pixels nor the camera trajectory.
"""
from pathlib import Path
import hashlib
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt


def refine_segment_boundaries(depth, mask_directory: Path, radius=5):
    h, w = depth.shape
    masks = {}
    input_hashes = {}
    for name in ('laptop','lamp','chair','arm','cup','book','note','phone','headphones','left-objects'):
        path = mask_directory / f'{name}-mask.png'
        input_hashes[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        masks[name] = np.asarray(Image.open(path).resize((w,h), Image.Resampling.NEAREST)) > 128
    # Use smallest objects first so an enclosing SAM mask cannot claim them.
    labels = np.zeros((h,w), np.uint8)
    for i,(name,mask) in enumerate(sorted(masks.items(),key=lambda pair:pair[1].sum()),1):
        labels[mask & (labels == 0)] = i
    refined = depth.copy()
    corrected = np.zeros((h,w), bool)
    for label in np.unique(labels):
        mask = labels == label
        inside = distance_transform_edt(mask)
        interior = inside > radius
        if not interior.any():
            continue
        distance, indices = distance_transform_edt(~interior, return_indices=True)
        # Limit propagation: preserve thin branches that have no nearby reliable core.
        band = mask & ~interior & (distance <= radius * 2.5)
        refined[band] = depth[indices[0][band], indices[1][band]]
        corrected |= band
    return refined, {'method':'SAM 2.1 silhouette-conditioned depth reassignment',
                     'radius_pixels':radius,'corrected_pixels':int(corrected.sum()),
                     'mask_sha256':input_hashes,
                     'rgb_modified':False,'hidden_surfaces_added':False}
