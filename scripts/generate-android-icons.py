"""Генерация иконок для Android-порта из того же дизайна, что и Windows-иконка.

Алгоритм повторяет scripts/generate-icon.py один в один (градиент
#6C8CFF -> #3F5CD0, белое кольцо R=72/256 с толщиной 6 в каждую сторону,
стрелка-компас), только в нужных Android-плотностях. Пишет PNG в res/mipmap-*.

Запуск: python scripts/generate-android-icons.py
"""

import math
import os
import struct
import zlib

# Дизайн задан в системе координат 256x256 (как в Windows-версии).
DESIGN = 256
ACCENT_TOP = (0x6C, 0x8C, 0xFF)
ACCENT_BOTTOM = (0x3F, 0x5C, 0xD0)

DENSITIES = {
    "mdpi": 48,
    "hdpi": 72,
    "xhdpi": 96,
    "xxhdpi": 144,
    "xxxhdpi": 192,
}


def lerp(a, b, t):
    return a + (b - a) * t


def build(size):
    scale = size / DESIGN
    center = size / 2.0
    corner = 56.0 * scale
    ring_radius = 72.0 * scale
    ring_width = 6.0 * scale

    needle = [
        (center, 64.0 * scale),
        (center + 24.0 * scale, center),
        (center, size - 64.0 * scale),
        (center - 24.0 * scale, center),
    ]

    def rounded_rect_inside(x, y):
        cx = min(max(x, corner), size - corner)
        cy = min(max(y, corner), size - corner)
        return math.hypot(x - cx, y - cy) <= corner

    def ring_inside(x, y):
        return abs(math.hypot(x - center, y - center) - ring_radius) <= ring_width

    def point_in_polygon(x, y):
        inside = False
        n = len(needle)
        j = n - 1
        for i in range(n):
            xi, yi = needle[i]
            xj, yj = needle[j]
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
        r, g, b, a = buffer[index]
        out_a = alpha + a * (1 - alpha)
        if out_a <= 0:
            buffer[index] = [0.0, 0.0, 0.0, 0.0]
            return
        buffer[index] = [
            (color[0] * alpha + r * a * (1 - alpha)) / out_a,
            (color[1] * alpha + g * a * (1 - alpha)) / out_a,
            (color[2] * alpha + b * a * (1 - alpha)) / out_a,
            out_a,
        ]

    buffer = [[0.0, 0.0, 0.0, 0.0] for _ in range(size * size)]

    for y in range(size):
        for x in range(size):
            index = y * size + x
            t = y / (size - 1)
            color = (
                int(lerp(ACCENT_TOP[0], ACCENT_BOTTOM[0], t)),
                int(lerp(ACCENT_TOP[1], ACCENT_BOTTOM[1], t)),
                int(lerp(ACCENT_TOP[2], ACCENT_BOTTOM[2], t)),
            )
            composite(buffer, index, color, coverage(x, y, rounded_rect_inside))

            # лёгкий блик сверху
            if y < size * 0.45:
                composite(buffer, index, (255, 255, 255), 0.06 * (1 - y / (size * 0.45)))

            composite(buffer, index, (255, 255, 255), coverage(x, y, ring_inside, 4) * 0.95)
            composite(buffer, index, (255, 255, 255), coverage(x, y, point_in_polygon, 4))
    return buffer


def write_png(path, size):
    buffer = build(size)
    raw = bytearray()
    for y in range(size):
        raw.append(0)
        for x in range(size):
            r, g, b, a = buffer[y * size + x]
            raw += bytes((
                min(255, max(0, int(round(r)))),
                min(255, max(0, int(round(g)))),
                min(255, max(0, int(round(b)))),
                min(255, max(0, int(round(a * 255)))),
            ))

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')

    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as handle:
        handle.write(png)


if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    res = os.path.join(root, 'android', 'app', 'src', 'main', 'res')
    for density, size in DENSITIES.items():
        for name in ("ic_launcher.png", "ic_launcher_round.png"):
            target = os.path.join(res, f'mipmap-{density}', name)
            write_png(target, size)
        print(f'{density}: {size}x{size} -> mipmap-{density}')
    print('Готово.')
