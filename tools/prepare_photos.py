#!/usr/bin/env python3
"""
Prepare a trip's photos for the website.

  python tools/prepare_photos.py <folder-with-original-photos> <trip-id>

What it does
  * rotates each photo upright (by its EXIF orientation)
  * saves a web copy (long side 1600 px) to trips/<trip-id>/photos/
  * saves a thumbnail (long side 600 px) to trips/<trip-id>/thumbs/
  * REMOVES all metadata (EXIF, GPS location, camera serial) from the saved copies
  * reads the GPS + time of each original (before stripping) and prints:
      - a suggested lat/lng for the trip pin (average of the photo locations)
      - a suggested "route" (photo locations in time order, thinned out)
      - a ready-to-paste "photos" list, sorted by the time each photo was taken
Originals are never modified.

Needs: pip install pillow      (for iPhone .HEIC photos also: pip install pillow-heif)
"""
import json, os, sys
from datetime import datetime
from PIL import Image, ImageOps

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

WEB, THUMB = 1600, 600
EXTS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"}


def gps_and_time(img):
    lat = lng = when = None
    try:
        exif = img.getexif()
        dt = exif.get_ifd(0x8769).get(36867) or exif.get(306)  # DateTimeOriginal / DateTime
        if dt:
            when = datetime.strptime(str(dt)[:19], "%Y:%m:%d %H:%M:%S")
        g = exif.get_ifd(0x8825)
        if g and 2 in g and 4 in g:
            def deg(v): return float(v[0]) + float(v[1]) / 60 + float(v[2]) / 3600
            lat, lng = deg(g[2]), deg(g[4])
            if g.get(1) == "S": lat = -lat
            if g.get(3) == "W": lng = -lng
    except Exception:
        pass
    return lat, lng, when


def save(img, path, size):
    im = img.copy()
    im.thumbnail((size, size), Image.LANCZOS)
    if im.mode not in ("RGB", "L"):
        im = im.convert("RGB")
    im.save(path, "JPEG", quality=82, optimize=True, progressive=True)  # no exif= → metadata dropped


def main():
    if len(sys.argv) != 3:
        print(__doc__); sys.exit(1)
    src, trip_id = sys.argv[1], sys.argv[2]
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out_p = os.path.join(root, "trips", trip_id, "photos")
    out_t = os.path.join(root, "trips", trip_id, "thumbs")
    os.makedirs(out_p, exist_ok=True); os.makedirs(out_t, exist_ok=True)

    items = []
    for name in sorted(os.listdir(src)):
        if os.path.splitext(name)[1].lower() not in EXTS:
            continue
        try:
            with Image.open(os.path.join(src, name)) as img:
                lat, lng, when = gps_and_time(img)
                img = ImageOps.exif_transpose(img)
                base = os.path.splitext(name)[0].replace(" ", "_") + ".jpg"
                save(img, os.path.join(out_p, base), WEB)
                save(img, os.path.join(out_t, base), THUMB)
                items.append({"file": base, "lat": lat, "lng": lng, "when": when})
                print("  ok ", name)
        except Exception as e:
            print("  SKIPPED", name, "-", e)

    items.sort(key=lambda x: (x["when"] is None, x["when"] or datetime.min, x["file"]))
    pts = [(round(x["lat"], 5), round(x["lng"], 5)) for x in items if x["lat"] is not None]
    size = sum(os.path.getsize(os.path.join(d, f)) for d in (out_p, out_t) for f in os.listdir(d))

    print("\n%d photos saved, %.1f MB in total (website limit is 1,000 MB for everything)." % (len(items), size / 1e6))
    if pts:
        lat = sum(p[0] for p in pts) / len(pts); lng = sum(p[1] for p in pts) / len(pts)
        step = max(1, len(pts) // 60)
        route = pts[::step] + ([pts[-1]] if pts[-1] not in pts[::step] else [])
        print("\nSuggested pin:   lat: %.4f, lng: %.4f," % (lat, lng))
        print("Suggested route (from photo GPS, check it does not include your home):")
        print("    route: " + json.dumps([list(p) for p in route]) + ",")
        dates = [x["when"] for x in items if x["when"]]
        if dates:
            print('    start: "%s", end: "%s",' % (min(dates).date(), max(dates).date()))
    else:
        print("\nNo GPS data found in these photos – set lat/lng by hand.")
    print("\nPhotos list (add captions inside the quotes):")
    print("    photos: [\n" + ",\n".join('      { file: "%s", caption: "" }' % x["file"] for x in items) + "\n    ],")


if __name__ == "__main__":
    main()
