#!/usr/bin/env python3
"""Remove checkered transparency pattern from PNG and make it truly transparent."""

from PIL import Image
import os

def remove_checker_background(input_path, output_path):
    """Remove the grey/white checkered background pattern."""
    img = Image.open(input_path).convert('RGBA')
    pixels = img.load()
    width, height = img.size

    # The checkered pattern typically uses these colors
    # Light grey: around (192, 192, 192) or (204, 204, 204)
    # White: (255, 255, 255)

    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]

            # Check if pixel is part of checkered background
            # These are typically grey or white with no color variation
            is_neutral = (abs(r - g) < 10 and abs(g - b) < 10 and abs(r - b) < 10)
            is_checker = r > 127 and g > 127 and b > 127  # Catch both light grey and white

            if is_neutral and is_checker:
                # Make it transparent
                pixels[x, y] = (r, g, b, 0)

    img.save(output_path, 'PNG')
    print(f"Saved fixed image to {output_path}")

if __name__ == '__main__':
    input_file = '/Users/bigsky/claudetorio/tmprjs9_epn.png'
    output_file = '/Users/bigsky/claudetorio/logo.png'
    remove_checker_background(input_file, output_file)
