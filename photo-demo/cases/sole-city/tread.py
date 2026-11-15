"""Rectify the visible mate's contact surface into a heel-to-toe material."""
import cv2
import numpy as np
from PIL import Image


def outsole_texture(rgb, output):
    # Rotation alone leaves midsole, floor and laces beside the oblique tread.
    # Two traced edges of its contact face, in the rotated photo frame (row, left, right).
    edges = np.array([
        (11, 60, 61), (16, 58, 66), (22, 56, 73), (30, 53, 84),
        (40, 51, 94), (55, 50, 105), (70, 50, 118), (83, 51, 126),
        (98, 54, 133), (108, 56, 136), (123, 58, 137), (138, 61, 134),
        (151, 63, 131), (163, 65, 125), (176, 59, 118), (186, 58, 113),
        (199, 56, 113), (215, 52, 115), (237, 49, 118), (255, 48, 119),
        (270, 49, 119), (285, 50, 117), (296, 54, 113), (306, 58, 109),
        (315, 65, 101), (321, 73, 94), (324, 80, 86)
    ])
    x, y = np.meshgrid(np.linspace(1, 0, 288), np.linspace(11, 324, 840))
    left, right = [np.interp(y, edges[:, 0], edges[:, k]) for k in (1, 2)]
    u = left + x * (right - left) - 65
    # Mirror the mate across its long axis onto the front shoe's registered last.
    px = (516 + .53*u + .848*y).astype(np.float32)
    py = (185 - .848*u + .53*y).astype(np.float32)
    patch = cv2.remap(rgb, px, py, cv2.INTER_CUBIC)
    Image.fromarray(patch).save(output/'tread.jpg', quality=95, subsampling=0)
