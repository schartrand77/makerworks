from PIL import Image, ImageDraw, ImageFont

img = Image.new("RGB", (512, 512), color=(0, 128, 255))
draw = ImageDraw.Draw(img)

text = "Sample"
try:
    font = ImageFont.truetype("arial.ttf", 40)
except:
    font = ImageFont.load_default()

bbox = draw.textbbox((0, 0), text, font=font)
w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
pos = ((512-w)//2, (512-h)//2)

draw.text(pos, text, fill="white", font=font)

img.save("sample.png")
print("✅ Saved sample.png")
