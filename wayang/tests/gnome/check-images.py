"""Compare the desktop interior, excluding Shell chrome, the pointer and the clock."""
from pathlib import Path
import sys
from PIL import Image, ImageChops, ImageStat

root = Path(sys.argv[1])
def scene(name):
    image = Image.open(root / (name + ".png")).convert("RGB")
    w, h = image.size
    return image.crop((w//8, h//8, 7*w//8, 7*h//8))

def delta(a,b):
    return sum(ImageStat.Stat(ImageChops.difference(scene(a), scene(b))).mean)/3

assert delta("system-background","wallpaper-a") > 5, "Wallpaper did not cover the background"
assert delta("wallpaper-a","wallpaper-b") > 0.01, "Wallpaper did not animate in the compositor"
assert delta("reduced-a","reduced-b") < 0.01, "Reduced motion failed to settle"
assert delta("system-background","restored") < 0.01, "Stop did not restore the system background"
crop_error=delta("export","reduced-a")
print("Mean desktop/export channel error:", crop_error)
assert crop_error < 1.0, "Desktop crop differs from exported still"
print("Verified compositor pixels, animation, reduced motion and restoration")
