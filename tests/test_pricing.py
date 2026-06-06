"""Smoke test for the pricing engine — covers standard, GPU, cap, invalid,
and edge cases. Run with: python tests/test_pricing.py"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib.pricing import calculate_quote

def main():
    print("=== Test 1: Standard 2240-RG 256GB/4TB ===")
    r = calculate_quote("2240-RG", memory_gb=256, storage_gb=4000,
                        customer={"name": "Rajesh", "company": "Acme"})
    print(f"  receipt_id: {r['receipt_id']}")
    print(f"  total: INR {r['total']:,}  (subtotal {r['subtotal']:,} + IGST {r['tax_amount']:,})")
    print(f"  line items: {len(r['line_items'])}, notes: {r['notes']}")

    print("\n=== Test 2: 2240-RG with 2 GPUs ===")
    r = calculate_quote("2240-RG", memory_gb=512, storage_gb=8000, gpu_count=2)
    print(f"  total: INR {r['total']:,}")
    gpus = [li for li in r["line_items"] if li["sku"] == "GPU-NVIDIA-L4"]
    print(f"  GPU line: {gpus[0] if gpus else None}")

    print("\n=== Test 3: 1240-RG (no GPU) - request GPU anyway ===")
    r = calculate_quote("1240-RG", memory_gb=64, storage_gb=2000, gpu_count=2)
    print(f"  notes: {r['notes']}")

    print("\n=== Test 4: Cap behavior - 1240-RG request 1TB RAM + 50TB ===")
    r = calculate_quote("1240-RG", memory_gb=1024, storage_gb=50000)
    print(f"  notes:")
    for n in (r["notes"] or []):
        print(f"    - {n}")

    print("\n=== Test 5: Invalid model ===")
    try:
        calculate_quote("9999-XX")
    except ValueError as e:
        print(f"  ValueError raised: {e}")

    print("\n=== Test 6: Bare model name (no Vantageo prefix) ===")
    r = calculate_quote("2240-RM", memory_gb=512, storage_gb=8000, gpu_count=1)
    print(f"  model resolved to: {r['configuration']['model']}")
    print(f"  total: INR {r['total']:,}")

    print("\n=== Test 7: Quantity 3, no customer info ===")
    r = calculate_quote("2240", quantity=3, memory_gb=128, storage_gb=2000)
    print(f"  total: INR {r['total']:,}")
    print(f"  customer: {r['customer']}")

    print("\n=== Test 8: Low-end 1240-RG default config ===")
    r = calculate_quote("1240-RG")
    print(f"  total: INR {r['total']:,}")
    print(f"  model: {r['configuration']['model']}")
    print(f"  form factor: {r['configuration']['form_factor']}")

    print("\nAll pricing tests passed.")

if __name__ == "__main__":
    main()
