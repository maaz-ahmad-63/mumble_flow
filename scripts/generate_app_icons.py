#!/usr/bin/env python3
"""
Generate native application icons (PNG, ICNS, ICO) for Mumble AI desktop companion.
Uses macOS iconutil for native ICNS generation and Pillow for multi-resolution images.
"""

import os
import subprocess
from PIL import Image, ImageDraw

def create_mumble_icon(size=1024):
    """Draw high-resolution Mumble AI icon."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    scale = size / 24.0

    # Rounded rectangle background (Warm Amber/Orange #FFA946)
    radius = int(6 * scale)
    bg_color = (255, 169, 70, 255)
    draw.rounded_rectangle([0, 0, size, size], radius=radius, fill=bg_color)

    # Microphone capsule: M12 4 a3 3 0 0 0 -3 3 v5 a3 3 0 0 0 6 0 V7 a3 3 0 0 0 -3 -3 z
    mic_left = int(9 * scale)
    mic_top = int(4 * scale)
    mic_right = int(15 * scale)
    mic_bottom = int(12 * scale)
    mic_radius = int(3 * scale)
    draw.rounded_rectangle([mic_left, mic_top, mic_right, mic_bottom], radius=mic_radius, fill=(255, 255, 255, 255))

    # Arc around microphone: M6 11 a6 6 0 0 0 12 0
    arc_box = [int(6 * scale), int(5 * scale), int(18 * scale), int(17 * scale)]
    draw.arc(arc_box, start=0, end=180, fill=(255, 255, 255, 255), width=int(2 * scale))

    # Stem: M12 17 v3
    stem_x = int(12 * scale)
    stem_y1 = int(17 * scale)
    stem_y2 = int(20 * scale)
    draw.line([stem_x, stem_y1, stem_x, stem_y2], fill=(255, 255, 255, 255), width=int(2 * scale))

    # Base: M9 20 h6
    base_x1 = int(9 * scale)
    base_x2 = int(15 * scale)
    base_y = int(20 * scale)
    draw.line([base_x1, base_y, base_x2, base_y], fill=(255, 255, 255, 255), width=int(2 * scale))

    return img

def main():
    assets_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../desktop/electron/assets'))
    os.makedirs(assets_dir, exist_ok=True)

    icon_1024 = create_mumble_icon(1024)
    png_path = os.path.join(assets_dir, 'icon.png')
    icon_1024.save(png_path, 'PNG')
    print(f"✓ Saved 1024x1024 PNG icon to {png_path}")

    # Generate Windows ICO containing multi-resolution frames
    ico_path = os.path.join(assets_dir, 'icon.ico')
    icon_1024.save(
        ico_path,
        format='ICO',
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    )
    print(f"✓ Saved multi-resolution Windows ICO to {ico_path}")

    # Generate macOS ICNS via iconutil
    iconset_dir = os.path.join(assets_dir, 'icon.iconset')
    os.makedirs(iconset_dir, exist_ok=True)

    icon_specs = [
        ('icon_16x16.png', 16),
        ('icon_16x16@2x.png', 32),
        ('icon_32x32.png', 32),
        ('icon_32x32@2x.png', 64),
        ('icon_128x128.png', 128),
        ('icon_128x128@2x.png', 256),
        ('icon_256x256.png', 256),
        ('icon_256x256@2x.png', 512),
        ('icon_512x512.png', 512),
        ('icon_512x512@2x.png', 1024)
    ]

    for fname, sz in icon_specs:
        resized = icon_1024.resize((sz, sz), Image.Resampling.LANCZOS)
        resized.save(os.path.join(iconset_dir, fname), 'PNG')

    icns_path = os.path.join(assets_dir, 'icon.icns')
    try:
        subprocess.run(['iconutil', '-c', 'icns', iconset_dir, '-o', icns_path], check=True)
        print(f"✓ Generated native macOS ICNS icon to {icns_path}")
    except Exception as e:
        print(f"⚠ iconutil not available or failed ({e}). ICNS generation skipped.")
    finally:
        # Clean up temporary iconset directory
        for f in os.listdir(iconset_dir):
            os.remove(os.path.join(iconset_dir, f))
        os.rmdir(iconset_dir)

if __name__ == '__main__':
    main()
