import json, sys
from pathlib import Path

JSON_DIR = Path(r"D:\firm\vantageo\json_formate")
OUTPUT = Path(r"D:\firm\vantageo\output\all_keys.json")

def collect_keys(obj, prefix=""):
    """Recursively collect all unique key paths from a nested dict/list."""
    keys = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            full_key = f"{prefix}.{k}" if prefix else k
            keys.add(full_key)
            if isinstance(v, (dict, list)):
                keys.update(collect_keys(v, full_key))
    elif isinstance(obj, list):
        for item in obj:
            if isinstance(item, dict):
                keys.update(collect_keys(item, f"{prefix}[]"))
    return keys

all_results = {}
for fp in sorted(JSON_DIR.glob("*.json")):
    with open(fp, "r", encoding="utf-8") as f:
        data = json.load(f)
    keys = collect_keys(data)
    all_results[fp.stem] = sorted(keys)

with open(OUTPUT, "w", encoding="utf-8") as f:
    json.dump(all_results, f, indent=2, ensure_ascii=False)

# Print summary
for name, keys in all_results.items():
    print(f"\n{'='*60}")
    print(f"  {name} — {len(keys)} unique keys")
    print(f"{'='*60}")
    for k in keys:
        print(f"  {k}")

# Also print union of all keys across files
union = sorted(set().union(*all_results.values()))
print(f"\n{'='*60}")
print(f"  ALL 5 FILES — {len(union)} unique keys total")
print(f"{'='*60}")
for k in union:
    print(f"  {k}")
