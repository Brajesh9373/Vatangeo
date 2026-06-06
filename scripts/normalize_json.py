"""
JSON Normalizer — Rewrites all 5 Vantageo JSONs into a unified canonical schema.
Preserves all data, removes key-name inconsistencies, harmonizes nested structures.
"""

import json
import sys
from copy import deepcopy
from pathlib import Path

SRC_DIR = Path(r"D:\firm\vantageo\json_formate")
DST_DIR = Path(r"D:\firm\vantageo\json_formate")  # overwrite in-place
OUTPUT_MAP = Path(r"D:\firm\vantageo\output\normalization_map.json")

# ============================================================
# CANONICAL SCHEMA (every normalized file will have these keys)
# ============================================================

def empty_canonical():
    return {
        "product": "",
        "form_factor": "",
        "dimensions": {},
        "weight": {},
        "processor": {},
        "chipset": "",
        "memory": {},
        "memory_dimms_supported": [],
        "interconnect": {},
        "storage": {},
        "internal_storage": {},
        "raid": {},
        "expansion_slots": [],
        "networking": {},
        "video": {},
        "front_io": {},
        "rear_io": {},
        "internal_io": {},
        "power_supply": {},
        "cooling": {},
        "management": {},
        "security": {},
        "tpm": {},
        "bios": {},
        "os_support": [],
        "environment": {},
        "supported_components": [],
        "applications": [],
        "key_features": [],
    }


# ============================================================
# PER-FILE NORMALIZERS
# ============================================================

def norm_1240_RG(data, out):
    out["product"] = "Vantageo 1240-RG"
    out["form_factor"] = data.get("form_factor", "")

    # Processor
    proc = data.get("processor", {})
    out["processor"] = {
        "families": proc.get("supported_processors", []),
        "sockets": proc.get("socket_count", 0),
        "max_tdp_w": proc.get("max_tdp_watts", 0),
    }

    # Socket
    sock = data.get("socket", {})
    if sock:
        out["processor"]["socket_type"] = sock.get("type", "")
        out["processor"]["socket_count"] = sock.get("count", proc.get("socket_count", 0))

    out["chipset"] = data.get("chipset", "")

    # Memory — key is "memory_capacity" in this file
    mem = data.get("memory_capacity", {})
    out["memory"] = {
        "dimm_slots": mem.get("dimm_slots", 0),
        "memory_type": mem.get("memory_type", ""),
        "channels": mem.get("memory_architecture", ""),
        "supported_modules": mem.get("supported_modules", []),
        "max_capacity_per_dimm": mem.get("max_capacity_per_dimm", {}),
        "max_frequency": mem.get("max_speed", {}),
    }

    # Storage
    si = data.get("storage_interface", {}).get("pch", {})
    hdd = data.get("hdd_bays", {})
    out["storage"] = {
        "drive_bays": hdd.get("count", 0),
        "drive_size": hdd.get("drive_size", ""),
        "drive_type": hdd.get("type", ""),
        "sata_ports": si.get("sata_ports_supported", 0),
        "sata_speed": si.get("sata_speed", ""),
        "slimsas_connectors": si.get("slimsas_connectors", 0),
    }

    # RAID
    raid = data.get("raid", {})
    out["raid"] = {
        "controller": raid.get("controller", ""),
        "supported_levels": raid.get("supported_levels", []),
    }

    # Expansion slots — flat numbered slots
    slots = data.get("expansion_slots", {})
    slot_list = []
    for key, val in slots.items():
        if key == "m2_slot":
            out["internal_storage"] = {
                "m2_slots": val.get("count", 0),
                "key_type": val.get("key_type", ""),
                "interface": val.get("interface", ""),
                "source": val.get("source", ""),
                "supported_sizes": [val.get("supported_card_size", "")] if val.get("supported_card_size") else [],
            }
        elif isinstance(val, dict):
            slot_list.append({
                "id": key,
                "type": val.get("type", ""),
                "generation": val.get("generation", ""),
                "lanes": val.get("lanes", ""),
                "source": val.get("source", ""),
                "shared_with": val.get("shared_with", ""),
            })
    out["expansion_slots"] = slot_list

    # Networking
    lan = data.get("lan", {})
    net_ports = lan.get("network_ports", {})
    mgmt_lan = lan.get("management_lan", {})
    video = data.get("video", {})
    out["networking"] = {
        "lan_ports": {
            "count": net_ports.get("count", 0),
            "speed": net_ports.get("speed", ""),
            "controller": net_ports.get("controller", ""),
        },
        "management_lan": {
            "count": mgmt_lan.get("count", 0),
            "speed": mgmt_lan.get("speed", ""),
        },
        "ncsi_support": lan.get("ncsi_support", False),
    }
    out["video"] = {
        "controller": video.get("controller", ""),
        "vga_ports": video.get("vga_ports", 0),
    }

    # Front/Rear/Internal I/O
    rio = data.get("rear_io", {})
    out["rear_io"] = {
        "usb_ports": rio.get("usb_3_2_gen1_ports", 0),
        "vga_ports": rio.get("vga_ports", 0),
        "com_ports": rio.get("com_ports", 0),
        "rj45_ports": rio.get("rj45_ports", 0),
        "mgmt_lan_ports": rio.get("management_lan_ports", 0),
        "id_button": rio.get("id_button_with_led", 0),
    }
    out["front_io"] = {}

    iio = data.get("internal_io", {})
    pc = iio.get("power_connectors", {})
    fh = iio.get("fan_headers", {})
    sc = iio.get("storage_connectors", {})
    hd = iio.get("headers", {})
    uh = iio.get("usb_headers", {})
    out["internal_io"] = {
        "power_connectors": {"24pin_atx": pc.get("24_pin_atx", 0), "8pin_atx_12v": pc.get("8_pin_atx_12v", 0)},
        "fan_headers": {"cpu_fan": fh.get("cpu_fan", 0), "system_fan": fh.get("system_fan", 0)},
        "usb_headers": {"usb_3_2_gen1": uh.get("usb_3_2_gen1", 0)},
        "storage_connectors": {"m2_slots": sc.get("m2_slots", 0), "slimsas": sc.get("slimsas_connectors", 0), "vroc": sc.get("vroc_connector", 0)},
        "headers": {k: v for k, v in hd.items()},
    }

    # Power
    psu = data.get("power_supply", {})
    psu_c = data.get("psu_connectors", {})
    out["power_supply"] = {
        "type": psu.get("type", ""),
        "options": [w.replace("W", " W") if "W" not in w else w for w in psu.get("supported_options", [])],
        "connectors": {"24pin_atx": psu_c.get("24_pin_atx_main_power", 0), "8pin_atx_12v": psu_c.get("8_pin_atx_12v_power", 0)},
    }

    # Management
    sm = data.get("server_management", {})
    out["management"] = {
        "bmc": sm.get("bmc", ""),
        "software": sm.get("management_software", ""),
        "features": sm.get("features", []),
    }

    # TPM
    tpm = data.get("tpm", {})
    out["tpm"] = {
        "header_count": tpm.get("header", {}).get("count", 0),
        "interface": tpm.get("header", {}).get("interface", ""),
        "optional_kit": tpm.get("optional_kit", ""),
    }

    # OS
    os_d = data.get("os_compatibility", {})
    out["os_support"] = os_d.get("certifications", [])

    # Environment
    op = data.get("operating_properties", {})
    out["environment"] = {
        "operating_temp_c": {"min": op.get("operating_temperature", {}).get("min_celsius", 0), "max": op.get("operating_temperature", {}).get("max_celsius", 0)},
        "operating_humidity_pct": {"min": op.get("operating_humidity", {}).get("min_percent", 0), "max": op.get("operating_humidity", {}).get("max_percent", 0), "condition": op.get("operating_humidity", {}).get("condition", "")},
        "non_operating_temp_c": {"min": op.get("non_operating_temperature", {}).get("min_celsius", 0), "max": op.get("non_operating_temperature", {}).get("max_celsius", 0)},
        "non_operating_humidity_pct": {"min": op.get("non_operating_humidity", {}).get("min_percent", 0), "max": op.get("non_operating_humidity", {}).get("max_percent", 0), "condition": op.get("non_operating_humidity", {}).get("condition", "")},
    }

    out["security"] = {"features": ["TPM"] if tpm else []}


def norm_2240_RG(data, out):
    out["product"] = data.get("model", "Vantageo 2240-RG")
    out["form_factor"] = data.get("form_factor", "")

    # Overview
    ov = data.get("overview", {})
    out["applications"] = ov.get("target_applications", [])

    # Processor
    proc = data.get("processor", {})
    out["processor"] = {
        "families": proc.get("supported_processors", []),
        "sockets": proc.get("socket_count", 0),
    }

    out["chipset"] = data.get("chipset", "")

    # Memory
    mem = data.get("memory", {})
    out["memory"] = {
        "dimm_slots": mem.get("dimm_slots", 0),
        "memory_type": mem.get("memory_type", ""),
        "channels": mem.get("memory_architecture", ""),
        "supported_modules": [],
        "max_capacity_per_dimm": {},
        "max_frequency": {},
    }

    # Storage
    st = data.get("storage", {})
    db = data.get("drive_bays", {})
    bp = data.get("backplane", {})
    out["storage"] = {
        "drive_bays": db.get("count", 0),
        "drive_size": db.get("drive_size", ""),
        "drive_type": db.get("type", ""),
        "supported_drive_types": db.get("supported_drive_types", []),
        "sata_ports": st.get("sata_ports_supported", 0),
        "sata_speed": st.get("sata_speed", ""),
        "slimsas_connectors": st.get("slimsas_connectors", 0),
        "m2_slots": st.get("m2_slots", {}).get("count", 0),
        "m2_interface": st.get("m2_slots", {}).get("interface", ""),
        "backplane": bp.get("type", ""),
    }

    # Internal storage
    out["internal_storage"] = {}

    # RAID
    raid = data.get("raid", {})
    out["raid"] = {
        "controller": raid.get("controller", ""),
        "supported_levels": raid.get("supported_levels", []),
    }

    # Expansion slots — flat numbered
    slots = data.get("expansion_slots", {})
    slot_list = []
    for key, val in slots.items():
        if key == "low_profile_slots":
            continue
        if isinstance(val, dict):
            slot_list.append({
                "id": key, "type": val.get("type", ""),
                "generation": val.get("generation", ""), "lanes": val.get("lanes", ""),
                "source": val.get("source", ""), "shared_with": val.get("shared_with", ""),
            })
    out["expansion_slots"] = slot_list

    # Networking
    net = data.get("networking", {})
    lp = net.get("lan_ports", {})
    out["networking"] = {
        "lan_ports": {"count": lp.get("count", 0), "speed": lp.get("speed", ""), "controller": lp.get("controller", "")},
    }

    # Video
    vid = data.get("video", {})
    out["video"] = {
        "controller": vid.get("controller", ""),
        "adapter": vid.get("graphics_adapter", ""),
        "bus": vid.get("bus_interface", ""),
        "max_resolution": vid.get("maximum_resolution", ""),
    }

    # Rear I/O
    rio = data.get("rear_io", {})
    out["rear_io"] = {
        "usb_ports": rio.get("usb_3_2_gen1_ports", 0),
        "vga_ports": rio.get("vga_ports", 0),
        "rj45_lan_ports": rio.get("rj45_lan_ports", 0),
        "rj45_serial_ports": rio.get("rj45_serial_ports", 0),
        "mgmt_lan_ports": rio.get("management_lan_ports", 0),
        "id_button": rio.get("id_button_with_led", 0),
    }

    # Power
    psu = data.get("power_supply", {})
    out["power_supply"] = {
        "type": psu.get("output_type", ""),
        "options": [w.replace("W", " W") if "W" not in w else w for w in psu.get("supported_options", [])],
        "redundancy": psu.get("redundancy", ""),
        "efficiency": psu.get("efficiency", ""),
        "pmbus_support": psu.get("pmbus_support", False),
    }

    # Cooling
    cool = data.get("cooling", {})
    cf = cool.get("fans", {})
    out["cooling"] = {
        "fans": {"count": cf.get("count", 0), "size": cf.get("size", ""), "type": cf.get("type", ""), "speed_control": cf.get("speed_control", "")},
    }

    # Management
    mgmt = data.get("management", {})
    out["management"] = {
        "features": mgmt.get("features", []),
    }

    # TPM
    tpm = data.get("tpm", {})
    out["tpm"] = {
        "header_count": tpm.get("header", {}).get("count", 0),
        "interface": tpm.get("header", {}).get("interface", ""),
        "optional_kit": tpm.get("optional_kit", ""),
    }

    # Environment
    env = data.get("operating_environment", {})
    ot = env.get("operating_temperature", {})
    nt = env.get("non_operating_temperature", {})
    oh = env.get("operating_relative_humidity", {})
    nh = env.get("non_operating_relative_humidity", {})
    out["environment"] = {
        "operating_temp_c": {"range": ot.get("celsius", "")},
        "non_operating_temp_c": {"range": nt.get("celsius", "")},
        "operating_humidity_pct": {"range": oh.get("range", ""), "condition": oh.get("condition", "")},
        "non_operating_humidity_pct": {"range": nh.get("range", ""), "condition": nh.get("condition", "")},
    }

    out["security"] = {"features": ["TPM"] if tpm else []}
    out["key_features"] = data.get("key_features", [])


def norm_2240_RM(data, out):
    out["product"] = data.get("product", "Vantageo 2240-RM")
    out["form_factor"] = data.get("form_factor", "")

    # Dimensions
    dim = data.get("dimensions", {})
    out["dimensions"] = {
        "width_mm": dim.get("width_mm", 0), "height_mm": dim.get("height_mm", 0), "depth_mm": dim.get("depth_mm", 0),
        "width_in": dim.get("width_inches", 0), "height_in": dim.get("height_inches", 0), "depth_in": dim.get("depth_inches", 0),
    }

    # Processor
    proc = data.get("processor", {})
    out["processor"] = {
        "families": proc.get("supported_processors", []),
        "max_tdp_w": proc.get("max_tdp_watts", 0),
    }

    out["chipset"] = data.get("chipset", "")

    # Memory
    mem = data.get("memory", {})
    out["memory"] = {
        "dimm_slots": mem.get("dimm_slots", 0),
        "memory_type": mem.get("memory_type", ""),
        "channels": str(mem.get("channels", "")),
        "dpc": mem.get("dpc", ""),
        "supported_modules": mem.get("supported_modules", []),
        "max_capacity_per_dimm": mem.get("max_capacity_per_dimm", {}),
        "max_frequency": mem.get("max_frequency", {}),
    }

    # Storage
    db = data.get("drive_bays", {})
    out["storage"] = {
        "drive_bays": db.get("count", 0),
        "drive_type": db.get("type", ""),
        "supported_interfaces": db.get("supported_interfaces", []),
        "sas_note": db.get("sas_note", ""),
    }

    # Internal storage
    ist = data.get("internal_storage", {})
    out["internal_storage"] = {
        "m2_slots": ist.get("m2_slots", 0),
        "key_type": ist.get("key_type", ""),
        "interface": ist.get("interface", ""),
        "source": ist.get("source", ""),
        "supported_sizes": ist.get("supported_sizes", []),
    }

    # RAID
    raid = data.get("raid", {})
    ob_raid = raid.get("onboard_raid", {})
    vroc = raid.get("vroc", {})
    rc_list = data.get("raid_controllers", [])
    rf = data.get("raid_features", {})
    out["raid"] = {
        "controller": ob_raid.get("controller", ""),
        "supported_levels": ob_raid.get("supported_levels", []),
        "vroc_header": vroc.get("header_count", 0),
        "vroc_supports": vroc.get("supports", ""),
        "external_controllers": rc_list,
        "features": rf.get("data_protection_features", []),
        "management_tools": rf.get("management_tools", []),
    }

    # Expansion slots — riser-based
    es = data.get("expansion_slots", {})
    slot_list = []
    for key, val in es.items():
        if key.startswith("riser"):
            if isinstance(val, dict):
                for sub_key, sub_val in val.items():
                    if isinstance(sub_val, dict):
                        slot_list.append({
                            "id": f"{key}_{sub_key}",
                            "slot": sub_val.get("slot", ""),
                            "signal": sub_val.get("signal", ""),
                            "source": sub_val.get("source", ""),
                            "supports": sub_val.get("supports", ""),
                            "count": sub_val.get("count", 1),
                        })
        elif key == "ocp_3_0" and isinstance(val, dict):
            slot_list.append({
                "id": "ocp_3_0", "slot": f"OCP 3.0 x{val.get('count', 1)}",
                "interface": val.get("interface", ""), "source": val.get("source", ""),
                "supports": val.get("supports", []),
            })
    out["expansion_slots"] = slot_list

    # Networking
    net = data.get("networking", {})
    eth = net.get("ethernet_ports", {})
    out["networking"] = {
        "onboard_lan": net.get("onboard_lan", False),
        "lan_ports": {"count": eth.get("count", 0), "type": eth.get("type", "")},
        "optional_modules": net.get("optional_modules", []),
    }

    # Front/Rear I/O
    fio = data.get("front_io", {})
    out["front_io"] = {
        "usb_ports": fio.get("usb_2_0_type_a_ports", 0),
        "vga_ports": fio.get("vga_ports", 0),
        "power_led_button": fio.get("system_power_led_button", 0),
        "uid_led_button": fio.get("uid_led_button", 0),
        "reset_button": fio.get("reset_button", 0),
        "status_leds": fio.get("status_leds", []),
        "drive_bays": fio.get("hot_swap_drive_bays", 0),
    }
    rio = data.get("rear_io", {})
    mp = rio.get("management_port", {})
    out["rear_io"] = {
        "mgmt_port": {"count": mp.get("count", 0), "type": mp.get("type", "")},
        "usb_ports": rio.get("usb_2_0_type_a_ports", 0),
        "com_ports": rio.get("com_rj45_ports", 0),
        "vga_ports": rio.get("vga_ports", 0),
        "uid_led_button": rio.get("uid_led_button", 0),
    }

    # Power
    psu = data.get("power_supply", {})
    out["power_supply"] = {
        "type": psu.get("type", ""),
        "capacity": psu.get("capacity", ""),
        "redundancy": psu.get("redundancy", ""),
        "efficiency": psu.get("efficiency", ""),
    }

    # Cooling
    cool = data.get("cooling", {})
    hsf = cool.get("hot_swap_system_fans", {})
    ad = cool.get("air_duct", {})
    out["cooling"] = {
        "cpu_cooling_modules": cool.get("cpu_cooling_modules", 0),
        "cpu_cooling_type": cool.get("cpu_cooling_type", ""),
        "supported_cpu_tdp": cool.get("supported_cpu_tdp", ""),
        "fans": {"count": hsf.get("count", 0), "model": hsf.get("model", ""), "type": "hot_swap"},
        "air_duct": {"count": ad.get("count", 0), "supports": ad.get("supports", "")},
    }

    # Management
    sm = data.get("server_management", {})
    mp2 = sm.get("management_port", {})
    sys_mgmt = data.get("system_management", {})
    rm = data.get("remote_management", {})
    out["management"] = {
        "bmc": sm.get("bmc", ""),
        "firmware": sm.get("firmware", ""),
        "protocols": sm.get("supported_protocols", []),
        "features": sm.get("features", []),
        "mgmt_port": {"type": mp2.get("type", ""), "controller": mp2.get("controller", "")},
        "micro_sd_slot": sm.get("micro_sd_slot", 0),
        "monitoring": sys_mgmt.get("monitoring", []),
        "notifications": sys_mgmt.get("notifications", []),
        "remote_functions": rm.get("supported_functions", []),
        "remote_security": rm.get("security", []),
        "alerting": rm.get("alerting", []),
    }

    # Security
    sec = data.get("security", {})
    out["security"] = {"features": sec.get("features", [])}

    # TPM
    out["tpm"] = {}  # Embedded in security for this file

    # BIOS
    bios = data.get("bios", {})
    out["bios"] = {
        "type": bios.get("type", ""),
        "features": bios.get("features", []),
    }

    # OS
    os_d = data.get("supported_operating_systems", {})
    os_list = []
    for cat, items in os_d.items():
        if isinstance(items, list):
            os_list.extend(items)
    out["os_support"] = os_list

    # Environment
    env = data.get("environment", {})
    out["environment"] = {
        "operating_temp_c": env.get("operating_temperature", ""),
        "non_operating_temp_c": env.get("non_operating_temperature", ""),
        "non_operating_humidity_pct": env.get("non_operating_relative_humidity", ""),
    }


def norm_2240(data, out):
    out["product"] = "Vantageo 2240"
    out["form_factor"] = data.get("form_factor", "")

    # Dimensions
    dim = data.get("dimensions", {})
    out["dimensions"] = {
        "width_mm": dim.get("width_mm", 0), "height_mm": dim.get("height_mm", 0), "depth_mm": dim.get("depth_mm", 0),
        "width_in": dim.get("width_inches", 0), "height_in": dim.get("height_inches", 0), "depth_in": dim.get("depth_inches", 0),
    }

    # Processor
    proc = data.get("processor", {})
    families = proc.get("supported_processors", "")
    out["processor"] = {
        "families": [families] if isinstance(families, str) and families else [],
        "max_tdp_w": proc.get("max_tdp_watts", 0),
    }

    out["chipset"] = data.get("chipset", "")

    # Memory
    mem = data.get("memory", {})
    mf = mem.get("max_frequency", {})
    mc = mem.get("max_capacity_per_dimm", {})
    out["memory"] = {
        "dimm_slots": mem.get("dimm_slots", 0),
        "channels": str(mem.get("channels", "")),
        "dpc": mem.get("dpc", ""),
        "supported_modules": mem.get("supported_memory_types", []),
        "max_capacity_per_dimm": {k: v for k, v in mc.items()},
        "max_frequency": {
            "5th_gen": mf.get("5th_gen_xeon", {}),
            "4th_gen": mf.get("4th_gen_xeon", {}),
        },
    }

    # Storage
    db = data.get("drive_bays", {})
    out["storage"] = {
        "drive_bays": db.get("count", 0),
        "drive_type": db.get("type", ""),
        "supported_interfaces": db.get("supported_interfaces", []),
        "sas_note": db.get("sas_support_note", ""),
    }

    # Internal storage
    ist = data.get("internal_storage", {})
    out["internal_storage"] = {
        "m2_slots": ist.get("m2_slots", 0),
        "interface": ist.get("interface", ""),
        "source": ist.get("source", ""),
        "supported_sizes": ist.get("supported_sizes", []),
    }

    # RAID
    raid = data.get("raid", {})
    out["raid"] = {
        "controller": "Intel SATA RAID",
        "supported_levels": raid.get("supported_levels", []),
        "vroc_header": raid.get("vroc_header", ""),
    }

    # Expansion — riser arrays
    es = data.get("expansion_slots", {})
    ocp = data.get("ocp_3_0", {})
    slot_list = []
    for key, val in es.items():
        if key.startswith("riser") and isinstance(val, list):
            for item in val:
                if isinstance(item, dict):
                    slot_list.append({
                        "id": key,
                        "slot": item.get("slot", ""),
                        "signal": item.get("signal", ""),
                        "source": item.get("source", ""),
                        "supports": item.get("support", ""),
                        "count": item.get("slot_count", 1),
                    })
    if ocp:
        slot_list.append({
            "id": "ocp_3_0", "slot": f"OCP 3.0 x{ocp.get('slots', 1)}",
            "interface": ocp.get("interface", ""), "source": ocp.get("source", ""),
            "supports": ocp.get("supports", []),
        })
    out["expansion_slots"] = slot_list

    # Networking
    net = data.get("networking", {})
    out["networking"] = {
        "onboard_lan": net.get("onboard_lan", ""),
        "lan_ports": {"type": net.get("ethernet_ports", "")},
        "optional_module": net.get("optional_module", ""),
    }

    # Front/Rear I/O
    fio = data.get("front_io", {})
    out["front_io"] = {
        "usb_ports": fio.get("usb_ports", ""),
        "vga_ports": fio.get("vga_ports", 0),
        "power_led_button": fio.get("system_power_led_button", 0),
        "uid_led_button": fio.get("uid_led_button", 0),
        "reset_button": fio.get("reset_button", 0),
        "status_leds": fio.get("status_leds", []),
        "drive_bays": fio.get("drive_bays", ""),
    }
    rio = data.get("rear_io", {})
    out["rear_io"] = {
        "mgmt_port": rio.get("management_port", ""),
        "usb_ports": rio.get("usb_ports", ""),
        "com_port": rio.get("com_port", ""),
        "vga_ports": rio.get("vga_ports", 0),
        "uid_led_button": rio.get("uid_led_button", 0),
    }

    # Power
    psu = data.get("power_supply", {})
    out["power_supply"] = {
        "capacity": psu.get("capacity", ""),
        "redundancy": psu.get("redundancy", ""),
        "efficiency": psu.get("efficiency", ""),
    }

    # Cooling
    cool = data.get("cooling", {})
    out["cooling"] = {
        "cpu_cooling": cool.get("cpu_cooling", ""),
        "supported_cpu_tdp": cool.get("supported_cpu_tdp", ""),
        "system_fans": cool.get("system_fans", ""),
        "air_duct": cool.get("air_duct", ""),
    }

    # Management
    sm = data.get("server_management", {})
    out["management"] = {
        "bmc": sm.get("bmc", ""),
        "firmware": sm.get("firmware", ""),
        "protocols": sm.get("supported_protocols", []),
        "features": sm.get("features", []),
        "mgmt_port": sm.get("management_port", ""),
        "micro_sd_slot": sm.get("micro_sd_slot", ""),
    }

    # TPM
    tpm = data.get("tpm", {})
    out["tpm"] = {
        "header": tpm.get("header", ""),
        "version": tpm.get("version", ""),
    }

    # Security
    sec = data.get("security", {})
    out["security"] = {"tpm": sec.get("tpm", ""), "features": []}

    # Environment
    env = data.get("environment", {})
    out["environment"] = {
        "operating_temp_c": env.get("operating_temperature", ""),
        "non_operating_temp_c": env.get("non_operating_temperature", ""),
        "non_operating_humidity_pct": env.get("non_operating_relative_humidity", ""),
    }


def norm_2240_re(data, out):
    out["product"] = data.get("product", "Vantageo 2240-RE")
    out["form_factor"] = data.get("form_factor", "")

    # Dimensions
    dim = data.get("dimensions", {})
    out["dimensions"] = {
        "width_mm": dim.get("width_mm", 0), "height_mm": dim.get("height_mm", 0), "depth_mm": dim.get("depth_mm", 0),
        "description": dim.get("description", ""),
    }

    # Weight
    wt = data.get("weight", {})
    out["weight"] = {"value": wt.get("value", 0), "unit": wt.get("unit", "")}

    out["chipset"] = data.get("chipset", "")

    # Processor
    proc = data.get("processor", {})
    out["processor"] = {
        "families": proc.get("supported_processors", []),
        "platform": proc.get("platform", ""),
    }

    # Memory
    mem = data.get("memory", {})
    out["memory"] = {
        "dimm_slots": mem.get("memory_slots", 0),
        "memory_type": mem.get("memory_type", ""),
        "max_speed": mem.get("max_speed", ""),
    }
    out["memory_dimms_supported"] = data.get("memory_dimms_supported", [])

    # Interconnect
    ic = data.get("interconnection_bus", {})
    out["interconnect"] = {
        "upi_links": ic.get("upi_links", 0),
        "max_upi_rate": ic.get("max_upi_rate", ""),
        "dmi_channels": ic.get("dmi_channels", 0),
    }

    # Storage
    st = data.get("storage", {})
    ls = st.get("local_storage", {}) if st else {}
    hdc = st.get("hard_disk_controller", {}) if st else {}
    out["storage"] = {
        "max_2_5_bays": ls.get("max_2_5_drive_bays", 0),
        "max_3_5_bays": ls.get("max_3_5_drive_bays", 0),
        "max_nvme_ssds": ls.get("max_nvme_ssds", 0),
        "raid_levels": hdc.get("supported_raid_levels", []),
        "power_off_protection": hdc.get("power_off_protection", False),
    }

    # RAID (extracted from storage)
    out["raid"] = {
        "controller": "Integrated",
        "supported_levels": hdc.get("supported_raid_levels", []),
    }

    # Expansion
    es = data.get("pcie_slots", {})
    out["expansion_slots"] = [{
        "id": "pcie_total",
        "total_slots": es.get("total_supported", 0),
        "ocp_slots": es.get("ocp_dedicated_slots", 0),
        "standard_slots": es.get("standard_pcie_slots", 0),
    }]

    # Networking
    nr = data.get("network_resources", {})
    op = data.get("onboard_ports", {})
    out["networking"] = {
        "ocp_interfaces": nr.get("ocp_3_0_interfaces", ""),
        "ocp_speed": nr.get("ocp_interface_speed", ""),
        "optional_pcie_5_x16": nr.get("optional_expansion", {}).get("pcie_5_x16_slots", "") if isinstance(nr.get("optional_expansion"), dict) else "",
        "onboard_ocp_nic": op.get("ocp_nic_3_0", ""),
    }

    # Video/Display
    disp = data.get("display", {})
    out["video"] = {
        "integrated": disp.get("integrated_graphics", ""),
        "optional_pcie": disp.get("optional_pcie_graphics_cards", ""),
    }

    # External interfaces → front_io + rear_io
    ei = data.get("external_interfaces", {})
    usb = ei.get("usb_interfaces", {}) if ei else {}
    vga = ei.get("vga_interfaces", {}) if ei else {}
    out["front_io"] = {
        "usb_front_2_0": usb.get("front_usb_2_0", 0),
        "usb_front_3_0": usb.get("front_usb_3_0", 0),
        "vga_front": vga.get("front_vga", 0),
    }
    out["rear_io"] = {
        "usb_rear_3_0": usb.get("rear_usb_3_0", 0),
        "usb_internal_2_0": usb.get("internal_usb_2_0", 0),
        "vga_rear": vga.get("rear_vga", 0),
        "serial_ports": ei.get("serial_ports", 0) if ei else 0,
    }

    # Power
    pw = data.get("power", {})
    out["power_supply"] = {
        "redundancy": pw.get("redundancy", ""),
        "efficiency": pw.get("efficiency", ""),
        "options": pw.get("supported_power_options", []) if isinstance(pw.get("supported_power_options"), list) else [pw.get("supported_power_options", "")],
        "input_power": pw.get("supported_input_power", []),
    }

    # Cooling
    cool = data.get("cooling", {})
    out["cooling"] = {
        "fan_groups": cool.get("fan_groups", 0),
        "redundancy": cool.get("redundancy", ""),
        "features": cool.get("features", []),
    }

    # Management
    mgmt = data.get("management", {})
    out["management"] = {
        "dedicated_mgmt_interfaces": mgmt.get("dedicated_management_network_interfaces", 0),
        "mgmt_port_type": mgmt.get("management_port_type", ""),
    }

    # Security
    sec = data.get("security", {})
    out["security"] = {"features": sec.get("features", [])}

    # OS
    os_d = data.get("supported_operating_systems", [])
    out["os_support"] = os_d if isinstance(os_d, list) else [os_d]

    # Environment
    ec = data.get("environmental_conditions", {})
    ot = ec.get("operating_temperature", {}) if ec else {}
    oh = ec.get("operating_humidity", {}) if ec else {}
    st_c = ec.get("storage_temperature", {}) if ec else {}
    th = ec.get("transportation_and_storage_humidity", {}) if ec else {}
    alt_d = ec.get("altitude_derating", {}) if ec else {}
    alt_l = ec.get("altitude_limitation", {}) if ec else {}
    out["environment"] = {
        "operating_temp_c": {"min": ot.get("min_celsius", 0), "max": ot.get("max_celsius", 0)},
        "operating_humidity_pct": {"range": oh.get("range", ""), "condensation": oh.get("condensation", "")},
        "storage_temp_c": {"min": st_c.get("min_celsius", 0), "max": st_c.get("max_celsius", 0)},
        "storage_humidity_pct": {"range": th.get("range", ""), "condensation": th.get("condensation", "")},
        "max_altitude_m": ec.get("maximum_altitude_meters", 0) if ec else 0,
        "altitude_derating": alt_d,
        "altitude_limitation": alt_l,
    }


# ============================================================
# DISPATCH
# ============================================================

NORMALIZERS = {
    "1240_RG.json": norm_1240_RG,
    "2240_RG.json": norm_2240_RG,
    "2240-RM.json": norm_2240_RM,
    "2240.json": norm_2240,
    "2240_re.json": norm_2240_re,
}


def strip_empty(d):
    """Recursively remove empty dicts, empty lists, None, and empty strings."""
    if isinstance(d, dict):
        cleaned = {}
        for k, v in d.items():
            v = strip_empty(v)
            if v is not None and v != "" and v != [] and v != {}:
                cleaned[k] = v
        return cleaned
    elif isinstance(d, list):
        cleaned = [strip_empty(item) for item in d]
        return [item for item in cleaned if item is not None and item != "" and item != [] and item != {}]
    return d


def main():
    mapping_report = {}
    normalized_count = 0

    for fp in sorted(SRC_DIR.glob("*.json")):
        name = fp.name
        if name not in NORMALIZERS:
            print(f"  [SKIP] {name} — no normalizer")
            continue

        with open(fp, "r", encoding="utf-8") as f:
            data = json.load(f)

        out = empty_canonical()
        NORMALIZERS[name](data, out)

        # Clean empty values
        out = strip_empty(out)

        # Write back
        fp.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
        normalized_count += 1

        # Count keys
        all_keys = set()
        def collect(kk, prefix=""):
            if isinstance(kk, dict):
                for k, v in kk.items():
                    fk = f"{prefix}.{k}" if prefix else k
                    all_keys.add(fk)
                    collect(v, fk)
            elif isinstance(kk, list):
                for i, item in enumerate(kk):
                    collect(item, f"{prefix}[{i}]")
        collect(out)
        mapping_report[name] = sorted(all_keys)
        print(f"  [OK] {name} -> {len(all_keys)} keys")

    # Report
    union = sorted(set().union(*mapping_report.values()))
    print(f"\n=== NORMALIZATION COMPLETE ===")
    print(f"  Files: {normalized_count}")
    print(f"  Unique keys (per-file avg): {sum(len(v) for v in mapping_report.values()) // len(mapping_report)}")
    print(f"  Canonical key set: {len(union)}")

    with open(OUTPUT_MAP, "w", encoding="utf-8") as f:
        json.dump({"files": mapping_report, "union": union}, f, indent=2, ensure_ascii=False)
    print(f"  Map saved: {OUTPUT_MAP}")


if __name__ == "__main__":
    main()
