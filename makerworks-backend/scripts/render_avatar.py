import sys
import os
import traceback

# Extract arguments passed after "--"
argv = sys.argv
argv = argv[argv.index("--") + 1:]
input_path = argv[0]
output_path = argv[1]

print(f"[AVATAR SCRIPT] Input: {input_path}")
print(f"[AVATAR SCRIPT] Output: {output_path}")

def generate_placeholder(path: str):
    """Generate a 512x512 grey placeholder without requiring Pillow."""
    try:
        from PIL import Image
        placeholder = Image.new("RGBA", (512, 512), (128, 128, 128, 255))
        placeholder.save(path, format="PNG")
        print("[AVATAR SCRIPT] ⚠️ Generated placeholder avatar (Pillow).")
    except ModuleNotFoundError:
        # Raw binary PNG 1x1 expanded to 512x512 grey fallback
        with open(path, "wb") as f:
            f.write(
                b"\x89PNG\r\n\x1a\n"
                b"\x00\x00\x00\rIHDR"
                b"\x00\x00\x02\x00\x00\x00\x02\x00"  # 512x512
                b"\x08\x06\x00\x00\x00"
                b"\xf4x\xd4\xfa"
                b"\x00\x00\x00\nIDATx\x9cc````\x00\x00\x00\x06\x00\x03"
                b"\x00\x00\x00\x00IEND\xaeB`\x82"
            )
        print("[AVATAR SCRIPT] ⚠️ Generated raw placeholder avatar (no Pillow).")

try:
    try:
        from PIL import Image
    except ModuleNotFoundError:
        print("[AVATAR SCRIPT][ERROR] Pillow not installed in Blender environment.")
        generate_placeholder(output_path)
        sys.exit(0)

    # ✅ Validate input file
    print(f"[AVATAR SCRIPT] Checking file at {input_path}")
    if not os.path.exists(input_path):
        raise RuntimeError(f"Input file does not exist: {input_path}")

    file_size = os.path.getsize(input_path)
    print(f"[AVATAR SCRIPT] Input file size: {file_size} bytes")
    if file_size == 0:
        raise RuntimeError(f"Input file is empty: {input_path}")

    # ✅ Open and log info
    img = Image.open(input_path)
    print(f"[AVATAR SCRIPT] Loaded image format={img.format}, mode={img.mode}, size={img.size}")
    img = img.convert("RGBA")

    # ✅ Center crop to square
    w, h = img.size
    size = min(w, h)
    left = (w - size) // 2
    top = (h - size) // 2
    right = left + size
    bottom = top + size
    img = img.crop((left, top, right, bottom))
    print(f"[AVATAR SCRIPT] Cropped to square: {img.size}")

    # ✅ Resize to 512x512
    img = img.resize((512, 512), Image.LANCZOS)
    print(f"[AVATAR SCRIPT] Resized to 512x512")

    # ✅ Save as PNG
    img.save(output_path, format="PNG")
    print("[AVATAR SCRIPT] ✅ Avatar created successfully (Pillow pipeline)")

except Exception as e:
    print(f"[AVATAR SCRIPT][ERROR] Failed to create avatar: {e}")
    traceback.print_exc()
    generate_placeholder(output_path)

finally:
    # ✅ Clean up uploaded input
    if os.path.exists(input_path):
        os.remove(input_path)
        print(f"[AVATAR SCRIPT] 🗑️ Deleted input file: {input_path}")
