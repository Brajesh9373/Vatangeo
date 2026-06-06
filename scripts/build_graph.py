"""
FalkorDB Graph Builder v3 — Single-query transactions. All 5 normalized JSONs.
"""

import json
from pathlib import Path
from falkordb import FalkorDB

JSON_DIR = Path(__file__).resolve().parent.parent / "json_formate"
GRAPH_NAME = "vantageo"


def connect(db):
    try:
        g = db.select_graph(GRAPH_NAME)
        g.delete()
    except Exception:
        pass
    return db.select_graph(GRAPH_NAME)


def S(val):
    """Safe Cypher string."""
    return str(val).replace("'", "").replace('"', "")


def run_all(g, name, data):
    """Emit all Cypher queries for one product."""
    model = S(data.get("product", name))
    ff = data.get("form_factor", "")
    proc = data.get("processor", {})
    chipset = data.get("chipset", "")
    mem = data.get("memory", {})
    mem_dimms = data.get("memory_dimms_supported", [])
    ic = data.get("interconnect", {})
    storage = data.get("storage", {})
    ist = data.get("internal_storage", {})
    raid = data.get("raid", {})
    slots = data.get("expansion_slots", [])
    net = data.get("networking", {})
    video = data.get("video", {})
    front_io = data.get("front_io", {})
    rear_io = data.get("rear_io", {})
    psu = data.get("power_supply", {})
    cooling = data.get("cooling", {})
    mgmt = data.get("management", {})
    security = data.get("security", {})
    tpm = data.get("tpm", {})
    bios = data.get("bios", {})
    os_list = data.get("os_support", [])
    apps = data.get("applications", [])
    features = data.get("key_features", [])
    weight = data.get("weight", {})
    dimensions = data.get("dimensions", {})

    queries = []

    # Product
    queries.append(f"MERGE (p:Product {{model: '{model}'}}) SET p.form_factor = '{S(ff)}', p.product = '{model}'")

    # Form Factor
    if ff:
        queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (f:FormFactor {{name: '{S(ff)}'}}) MERGE (p)-[:HAS_FORM_FACTOR]->(f)")

    # Processor
    if proc:
        families = proc.get("families", [])
        if isinstance(families, str):
            families = [families]
        for fam in families:
            fn = S(fam)[:50]
            queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (pf:ProcessorFamily {{name: '{fn}', full_name: '{S(fam)}'}}) MERGE (p)-[:SUPPORTS_FAMILY]->(pf)")
        max_tdp = proc.get("max_tdp_w", 0)
        socks = proc.get("sockets") or proc.get("socket_count") or 0
        stype = proc.get("socket_type", "")
        plat = proc.get("platform", "")
        pn = S(families[0] if families else "Unknown")[:40]
        queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (cpu:Processor {{name: '{pn}'}}) SET cpu.max_tdp = {max_tdp}, cpu.sockets = {socks}, cpu.socket_type = '{S(stype)}', cpu.platform = '{S(plat)}' MERGE (p)-[:SUPPORTS_PROCESSOR]->(cpu)")

    # Chipset
    if chipset:
        queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (c:Chipset {{name: '{S(chipset)}'}}) MERGE (p)-[:USES]->(c)")

    # Memory
    if mem:
        slots_v = mem.get("dimm_slots", 0)
        mtype = mem.get("memory_type", "")
        ch = str(mem.get("channels", ""))
        dpc = str(mem.get("dpc", ""))
        ms = mem.get("max_speed", "")
        queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (m:Memory {{slots: {slots_v}}}) SET m.type = '{S(mtype)}', m.channels = '{S(ch)}', m.dpc = '{S(dpc)}', m.max_speed = '{S(ms)}' MERGE (p)-[:HAS_MEMORY]->(m)")
        for d in mem_dimms:
            cap = d.get("capacity", "")
            typ = d.get("type", "")
            dn = S(f"{cap}_{typ}")[:60]
            queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (d:DIMM {{name: '{dn}', capacity: '{cap}', dimm_type: '{typ}'}}) MERGE (p)-[:SUPPORTS_DIMM]->(d)")

    # Interconnect
    if ic:
        upi = ic.get("upi_links", 0)
        rate = ic.get("max_upi_rate", "")
        dmi = ic.get("dmi_channels", 0)
        queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (ic:Interconnect {{product: '{model}'}}) SET ic.upi_links = {upi}, ic.max_upi_rate = '{S(rate)}', ic.dmi_channels = {dmi} MERGE (p)-[:HAS_INTERCONNECT]->(ic)")

    # Storage
    if storage:
        bays = storage.get("drive_bays") or storage.get("max_2_5_bays") or 0
        dtype = str(storage.get("drive_type") or storage.get("drive_size") or "")
        stn = S(f"{bays}x{dtype}")[:60]
        queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (s:Storage {{name: '{stn}'}}) SET s.bays = {bays}, s.drive_type = '{S(dtype)}' MERGE (p)-[:HAS_STORAGE]->(s)")
        nvme = storage.get("max_nvme_ssds", 0)
        if nvme:
            queries.append(f"MATCH (s:Storage {{name: '{stn}'}}) SET s.max_nvme_ssds = {nvme}")

    # Internal storage
    if ist:
        m2 = ist.get("m2_slots", 0)
        iface = ist.get("interface", "")
        queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (ist:InternalStorage {{product: '{model}'}}) SET ist.m2_slots = {m2}, ist.interface = '{S(iface)}' MERGE (p)-[:HAS_INTERNAL_STORAGE]->(ist)")

    # RAID
    if raid:
        ctrl = raid.get("controller", "")
        lvls = raid.get("supported_levels", [])
        if isinstance(lvls, str):
            lvls = [lvls]
        lstr = ":".join(str(l).replace(" ", "") for l in lvls)
        queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (r:RAID {{controller: '{S(ctrl)}'}}) SET r.levels = '{lstr}' MERGE (p)-[:SUPPORTS_RAID]->(r)")
        for rc in raid.get("external_controllers", []):
            cn = S(f"{rc.get('interface','')}_{rc.get('cache','')}")[:50]
            queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (rcn:RAIDController {{name: '{cn}', cache: '{rc.get('cache','')}', interface: '{rc.get('interface','')}', speed: '{rc.get('speed','')}'}}) MERGE (p)-[:SUPPORTS_RAID_CONTROLLER]->(rcn)")

    # Expansion slots
    for slot in slots:
        sid = S(slot.get("id", f"slot_{slots.index(slot)}"))
        s_slot = S(str(slot.get("slot", "")))
        signal = S(str(slot.get("signal", "")))
        source = S(str(slot.get("source", "")))
        supports = S(str(slot.get("supports", "")))
        count = slot.get("count", 1)
        queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (s:Slot {{id: '{model}_{sid}'}}) SET s.slot = '{s_slot}', s.signal = '{signal}', s.source = '{source}', s.supports = '{supports}', s.count = {count} MERGE (p)-[:HAS_SLOT]->(s)")
        if source and "CPU" in source.upper():
            queries.append(f"MATCH (s:Slot {{id: '{model}_{sid}'}}) MERGE (cpu:CPU {{id: '{model}_{source}'}}) MERGE (s)-[:SOURCED_FROM]->(cpu)")

    # Networking
    if net and isinstance(net, dict):
        lan = net.get("lan_ports", {}) or {}
        onboard = str(net.get("onboard_lan", ""))
        nicn = S(f"{lan.get('count','')}x_{lan.get('speed',lan.get('type',''))}")[:60]
        queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (nic:NIC {{name: '{nicn}'}}) SET nic.onboard = '{S(onboard)}', nic.speed = '{S(lan.get('speed',''))}', nic.type = '{S(lan.get('type',''))}' MERGE (p)-[:HAS_NETWORKING]->(nic)")
        for s in slots:
            if "ocp" in str(s.get("id", "")).lower():
                queries.append(f"MATCH (s:Slot {{id: '{model}_{s['id']}'}}) MATCH (nic:NIC {{name: '{nicn}'}}) MERGE (s)-[:SUPPORTS_NIC]->(nic)")

    # Video
    if video and isinstance(video, dict):
        ctrl = video.get("controller") or video.get("integrated") or ""
        if ctrl:
            queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (v:Video {{controller: '{S(ctrl)}'}}) MERGE (p)-[:HAS_VIDEO]->(v)")

    # Front I/O
    if front_io and isinstance(front_io, dict):
        usb = str(front_io.get("usb_ports") or front_io.get("usb_front_2_0") or "")
        vga = str(front_io.get("vga_ports") or front_io.get("vga_front") or "")
        queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (fio:FrontIO {{product: '{model}'}}) SET fio.usb = '{usb}', fio.vga = '{vga}' MERGE (p)-[:HAS_FRONT_IO]->(fio)")

    # Rear I/O
    if rear_io and isinstance(rear_io, dict):
        usb = str(rear_io.get("usb_ports") or rear_io.get("usb_rear_3_0") or "")
        vga = str(rear_io.get("vga_ports") or rear_io.get("vga_rear") or "")
        com = str(rear_io.get("com_ports") or rear_io.get("com_port") or rear_io.get("serial_ports") or "")
        queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (rio:RearIO {{product: '{model}'}}) SET rio.usb = '{usb}', rio.vga = '{vga}', rio.com = '{com}' MERGE (p)-[:HAS_REAR_IO]->(rio)")

    # Power supply
    if psu:
        cap = str(psu.get("capacity", ""))
        red = str(psu.get("redundancy", ""))
        eff = str(psu.get("efficiency", ""))
        ptype = str(psu.get("type", ""))
        psn = S(f"{cap}_{red}_{eff}")[:50]
        queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (ps:PSU {{name: '{psn}'}}) SET ps.capacity = '{cap}', ps.redundancy = '{red}', ps.efficiency = '{eff}', ps.psu_type = '{ptype}' MERGE (p)-[:HAS_PSU]->(ps)")

    # Cooling
    if cooling:
        fans = cooling.get("fans", {}) or {}
        fcount = fans.get("count") or cooling.get("fan_groups") or 0
        ftype = fans.get("type", "")
        queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (cl:Cooling {{product: '{model}'}}) SET cl.fans = {fcount}, cl.type = '{S(ftype)}' MERGE (p)-[:HAS_COOLING]->(cl)")

    # Management
    if mgmt:
        bmc = mgmt.get("bmc", "")
        if bmc:
            queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (bm:BMC {{name: '{S(bmc)}'}}) MERGE (p)-[:HAS_MANAGEMENT]->(bm)")
        fw = mgmt.get("firmware", "")
        if fw:
            queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (fw_node:Firmware {{name: '{S(fw)}'}}) MERGE (p)-[:HAS_FIRMWARE]->(fw_node)")

    # Security
    if security and isinstance(security, dict):
        feats = security.get("features", [])
        if isinstance(feats, str):
            feats = [feats]
        for feat in feats:
            fn = S(feat)[:50]
            queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (sf:SecurityFeature {{name: '{fn}'}}) MERGE (p)-[:HAS_SECURITY]->(sf)")

    # TPM
    if tpm and isinstance(tpm, dict):
        ver = tpm.get("version", "")
        if ver:
            queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (tp:TPM {{version: '{ver}'}}) MERGE (p)-[:HAS_TPM]->(tp)")

    # BIOS
    if bios and isinstance(bios, dict):
        btype = bios.get("type", "")
        if btype:
            queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (bs:BIOS {{type: '{S(btype)}'}}) MERGE (p)-[:HAS_BIOS]->(bs)")

    # OS
    if isinstance(os_list, str):
        os_list = [os_list]
    for os_item in os_list:
        if isinstance(os_item, str):
            oname = S(os_item)[:50]
            queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (os:OS {{name: '{oname}', full_name: '{S(os_item)}'}}) MERGE (p)-[:SUPPORTS_OS]->(os)")

    # Applications
    if isinstance(apps, str):
        apps = [apps]
    for app in apps:
        if isinstance(app, str):
            an = S(app)[:50]
            queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (a:Application {{name: '{an}', description: '{S(app)}'}}) MERGE (p)-[:TARGETS]->(a)")

    # Key features
    if isinstance(features, str):
        features = [features]
    for feat in features:
        if isinstance(feat, str):
            fn = S(feat)[:60]
            queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (kf:KeyFeature {{name: '{fn}', description: '{S(feat)}'}}) MERGE (p)-[:HAS_FEATURE]->(kf)")

    # Physical (weight + dimensions)
    has_weight = weight and isinstance(weight, dict) and weight.get("value")
    has_dims = dimensions and isinstance(dimensions, dict)
    if has_weight or has_dims:
        set_parts = []
        if has_weight:
            set_parts.append(f"pw.weight_value = {weight['value']}, pw.weight_unit = '{S(weight.get('unit', 'kg'))}'")
        if has_dims:
            d_keys = ["width_mm", "height_mm", "depth_mm", "width_in", "height_in", "depth_in"]
            set_parts.extend(f"pw.{k} = {dimensions.get(k, 0)}" for k in d_keys if dimensions.get(k))
            if dimensions.get("description"):
                set_parts.append(f"pw.description = '{S(dimensions['description'])}'")
        queries.append(f"MATCH (p:Product {{model: '{model}'}}) MERGE (pw:Physical {{product: '{model}'}}) SET {', '.join(set_parts)} MERGE (p)-[:HAS_PHYSICAL]->(pw)")

    # Execute
    ok = 0
    err = 0
    for q_str in queries:
        try:
            g.query(q_str)
            ok += 1
        except Exception as e:
            err += 1
            # Only report first error per file to avoid spam
            if err == 1:
                print(f"    [QERR] {str(e)[:100]}")

    return ok, err


def main():
    db = FalkorDB(host="localhost", port=6380)
    g = connect(db)

    total_ok = 0
    total_err = 0
    for fp in sorted(JSON_DIR.glob("*.json")):
        with open(fp, "r", encoding="utf-8") as f:
            data = json.load(f)
        ok, err = run_all(g, fp.stem, data)
        total_ok += ok
        total_err += err
        print(f"  [{fp.stem}] {ok} queries, {err} errors")

    # Summary
    r = g.query("MATCH (n) RETURN count(n) AS total")
    r2 = g.query("MATCH (p:Product) RETURN p.model")
    node_count = r.result_set[0][0] if r.result_set else 0
    print(f"\nGraph: {node_count} nodes, {len(r2.result_set)} products")
    for row in r2.result_set:
        print(f"  - {row[0]}")

    # Edge counts
    r3 = g.query("MATCH ()-[e]->() RETURN type(e) AS t, count(e) AS cnt ORDER BY cnt DESC")
    print(f"\nEdges:")
    for row in r3.result_set:
        print(f"  {row[0]:30s} {row[1]}")

    # Validation
    print(f"\n=== VALIDATION ===")
    r = g.query("MATCH (p:Product)-[:SUPPORTS_RAID]->(r:RAID) RETURN p.model, r.levels, r.controller")
    if r and r.result_set:
        for row in r.result_set:
            print(f"  RAID: {row[0]} = {row[2]} [{row[1]}]")
    else:
        print("  RAID: (no results)")

    r = g.query("MATCH (p:Product)-[:HAS_MEMORY]->(m:Memory) WHERE m.slots > 16 RETURN p.model, m.slots ORDER BY m.slots DESC")
    if r and r.result_set:
        for row in r.result_set:
            print(f"  >16 DIMM: {row[0]} ({row[1]} slots)")
    else:
        print("  Memory: (no results)")

    print(f"\nDone: {total_ok} queries OK, {total_err} errors")


if __name__ == "__main__":
    main()
