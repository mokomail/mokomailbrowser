#!/usr/bin/env python3
"""Генерация иконки приложения (assets/icons/icon.png) без внешних зависимостей.

Используется только стандартная библиотека: zlib + struct.
"""

import math
import os
import struct
import zlib

SIZE = 256
CENTER = SIZE / 2
RING_RADIUS = 72
RING_WIDTH = 6
CORNER = 56

ACCENT_TOP = (0x6C, 0x8C, 0xFF)
ACCENT_BOTTOM = (0x3F, 0x5C, 0xD0)


def lerp(a, b, t):
    return a + (b - a) * t


def rounded_rect_inside(x, y):
    cx = min(max(x, CORNER), SIZE - CORNER)
    cy = min(max(y, CORNER), SIZE - CORNER)
    return math.hypot(x - cx, y - cy) <= CORNER


def ring_inside(x, y):
    return abs(math.hypot(x - CENTER, y - CENTER) - RING_RADIUS) <= RING_WIDTH


NEEDLE = [(CENTER, 64), (CENTER + 24, CENTER), (CENTER, SIZE - 64), (CENTER - 24, CENTER)]


def point_in_polygon(x, y, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def coverage(x, y, inside_fn, samples=3):
    hits = 0
    for sy in range(samples):
        for sx in range(samples):
            px = x + (sx + 0.5) / samples
            py = y + (sy + 0.5) / samples
            if inside_fn(px, py):
                hits += 1
    return hits / (samples * samples)


def composite(buffer, index, color, alpha):
    if alpha <= 0:
        return
    sr, sg, sb = color
    dr, dg, db, da = buffer[index]
    out_a = alpha + da * (1 - alpha)
    if out_a <= 0:
        buffer[index] = [0.0, 0.0, 0.0, 0.0]
        return
    buffer[index] = [
        (sr * alpha + dr * da * (1 - alpha)) / out_a,
        (sg * alpha + dg * da * (1 - alpha)) / out_a,
        (sb * alpha + db * da * (1 - alpha)) / out_a,
        out_a,
    ]


def build():
    buffer = [[0.0, 0.0, 0.0, 0.0] for _ in range(SIZE * SIZE)]

    for y in range(SIZE):
        for x in range(SIZE):
            index = y * SIZE + x
            t = y / (SIZE - 1)
            color = (
                int(lerp(ACCENT_TOP[0], ACCENT_BOTTOM[0], t)),
                int(lerp(ACCENT_TOP[1], ACCENT_BOTTOM[1], t)),
                int(lerp(ACCENT_TOP[2], ACCENT_BOTTOM[2], t)),
            )
            composite(buffer, index, color, coverage(x, y, rounded_rect_inside))

            # лёгкий блик сверху
            if y < SIZE * 0.45:
                composite(buffer, index, (255, 255, 255), 0.06 * (1 - y / (SIZE * 0.45)))

            composite(buffer, index, (255, 255, 255), coverage(x, y, ring_inside, 4) * 0.95)
            composite(buffer, index, (255, 255, 255), coverage(x, y, lambda px, py: point_in_polygon(px, py, NEEDLE), 4))
    return buffer


def write_png(path, buffer):
    raw = bytearray()
    for y in range(SIZE):
        raw.append(0)
        for x in range(SIZE):
            r, g, b, a = buffer[y * SIZE + x]
            raw += bytes(
                (
                    min(255, max(0, int(round(r)))),
                    min(255, max(0, int(round(g)))),
                    min(255, max(0, int(round(b)))),
                    min(255, max(0, int(round(a * 255)))),
                )
            )

    def chunk(tag, data):
        return (
            struct.pack('>I', len(data))
            + tag
            + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', SIZE, SIZE, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as handle:
        handle.write(png)


if __name__ == '__main__':
    target = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'icons', 'icon.png')
    write_png(target, build())
    print(f'Иконка создана: {target}')
