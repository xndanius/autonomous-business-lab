#!/usr/bin/env python3
"""Import reviewed public art exports into the existing static readers."""
import argparse
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(path):
    return json.loads(path.read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    args = parser.parse_args()
    source = args.source.resolve()
    comic = load(source / "comic/manifest.json")
    atlas = load(source / "atlas/state.json")
    assert len(comic["pages"]) == comic["count"] == 187
    assert len(atlas["tiles"]) == atlas["count"] == 264
    assert [p["number"] for p in comic["pages"]] == list(range(1, 188))
    assert [t["id"] for t in atlas["tiles"]] == list(range(1, 265))
    assert comic["stopped_at"] == atlas["stopped_at"] == "2026-10-14T04:35:43Z"
    assert all(p.get("source_sha256") and p.get("export_sha256") for p in comic["pages"] + atlas["tiles"]), "Wait for the validated export to finish"

    # Copy only reviewed manifests and the artwork they explicitly reference.
    # No source prompts, local paths, writer credentials or runtime state are imported.
    assets = ROOT / "assets/final-archives"
    for kind, manifest_name, manifest, items in [
        ("comic", "manifest.json", comic, comic["pages"]),
        ("atlas", "state.json", atlas, atlas["tiles"]),
    ]:
        for item in items:
            for key in ("image", "thumbnail"):
                relative = Path(item[key])
                assert relative.parts[0] in ("images", "thumbs") and ".." not in relative.parts
                image = source / kind / relative
                assert image.is_file() and image.stat().st_size > 0, str(image)
                destination = assets / kind / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(image, destination)
        (assets / kind / manifest_name).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

    def public_path(kind, relative):
        return "assets/final-archives/" + kind + "/" + relative

    result = {
        "meta": {
            "comic": {"title": comic["title"], "premise": comic.get("premise"), "started": comic["started_at"], "count": comic["count"], "status": "stopped_by_danielius", "stopped_at": comic["stopped_at"]},
            "atlas": {"title": atlas["title"], "started": atlas["started_at"], "count": atlas["count"], "status": "stopped_by_danielius", "stopped_at": atlas["stopped_at"]},
        },
        "comic": [{
            "n": p["number"], "title": p["title"], "caption": p["caption"],
            "dialogue": p.get("dialogue", []), "at": p["generated_at"],
            "img": public_path("comic", p["image"]), "thumbnail": public_path("comic", p["thumbnail"]),
        } for p in comic["pages"]],
        "atlas": [{
            "id": t["id"], "x": t["x"], "y": t["y"], "title": t["title"],
            "description": t["description"], "at": t["generated_at"],
            "img": public_path("atlas", t["image"]), "thumbnail": public_path("atlas", t["thumbnail"]),
        } for t in atlas["tiles"]],
    }
    (ROOT / "assets/loops-data.json").write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(json.dumps({"comic_pages": len(result["comic"]), "atlas_tiles": len(result["atlas"]), "art_files": 2 * (len(result["comic"]) + len(result["atlas"])), "destination": str(assets)}))


if __name__ == "__main__":
    main()
