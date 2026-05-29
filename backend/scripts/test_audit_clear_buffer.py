"""
test_audit_clear_buffer.py — Day 16 #13 invariants for AuditService.clear_buffer
================================================================================
Mirrors the test_ari_fear_greed.py / test_grinold.py pattern: zero-dep,
exit 1 on any failure. Tests Mark's "Read A" semantics for the audit
trail soft-reset: the in-memory ring buffer clears but the JSONL on
disk is preserved (a tombstone event records the reset itself).

Invariants exercised
--------------------
  AC-1  After clear_buffer(), the ring buffer contains exactly one entry
        (the tombstone).
  AC-2  The tombstone has action="audit_buffer_clear", category="system",
        and a `before/after` payload that names the cleared count.
  AC-3  Lifetime total INCREASES (we recorded the tombstone) — the lifetime
        counter is preserved across the reset.
  AC-4  The disk log (JSONL) is preserved: every line written before the
        reset is still on disk after, plus the tombstone line.
  AC-5  Subsequent record() calls continue to append to disk and to the
        ring buffer (post-reset behaviour is normal).
  AC-6  Calling clear_buffer() twice in a row is idempotent in shape (each
        call yields exactly one tombstone in the ring) — used by the UI to
        let the operator double-click without breaking anything.
  AC-7  The metadata.reason makes it onto the tombstone when supplied.
  AC-8  An empty `reason` does not crash and does not write a metadata key.
"""

import json
import os as _os
import sys
import tempfile

_HERE = _os.path.dirname(_os.path.abspath(__file__))
_BE = _os.path.normpath(_os.path.join(_HERE, ".."))
if _BE not in sys.path:
    sys.path.insert(0, _BE)

# Force the audit service to write to a fresh tempdir so we don't pollute
# /data on the host. Must be set BEFORE importing the service.
_TMP = tempfile.mkdtemp(prefix="audit-clear-buffer-test-")
_LOG_PATH = _os.path.join(_TMP, "audit_log.jsonl")
_os.environ["AUDIT_LOG_PATH"] = _LOG_PATH

# Reload-safe import: if a previous test imported audit_service with a
# different LOG_PATH, drop it from the cache so the env-var takes effect.
for _mod in list(sys.modules):
    if _mod.startswith("services.audit_service"):
        del sys.modules[_mod]

from services.audit_service import audit_service, AuditService  # noqa: E402

passed = 0
failed = 0


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✓ {name}")
    else:
        failed += 1
        print(f"  ✗ {name}  {detail}")


def fresh_service():
    """Return a fresh AuditService bound to a per-test JSONL file."""
    sub = tempfile.mkdtemp(prefix="audit-fresh-", dir=_TMP)
    log = _os.path.join(sub, "audit_log.jsonl")
    _os.environ["AUDIT_LOG_PATH"] = log
    # Re-import the module so LOG_PATH is recomputed from the new env var.
    for _mod in list(sys.modules):
        if _mod.startswith("services.audit_service"):
            del sys.modules[_mod]
    from services.audit_service import audit_service as svc  # noqa: E402
    return svc, log


# ── AC-1, AC-2, AC-3, AC-4 ────────────────────────────────────────────────────
print("AC-1..4: clear_buffer leaves a tombstone, preserves disk")
svc, log_path = fresh_service()

# Seed three pre-reset events.
svc.record(action="bot_start",          actor="operator", category="lifecycle")
svc.record(action="risk_config_update", actor="operator", category="config",
           before={"max_dd": 0.20}, after={"max_dd": 0.15})
svc.record(action="manual_trade",       actor="operator", category="trading")

pre_count = len(svc.list(limit=1000))
pre_lifetime = svc.summary()["lifetime_total"]

result = svc.clear_buffer(actor="operator", reason="EOD reset")

ring_after = svc.list(limit=1000)
check("AC-1 ring contains exactly one entry post-clear",
      len(ring_after) == 1, f"got {len(ring_after)}")

ts = ring_after[0] if ring_after else {}
check("AC-2 tombstone action == 'audit_buffer_clear'",
      ts.get("action") == "audit_buffer_clear", f"got {ts.get('action')}")
check("AC-2 tombstone category == 'system'",
      ts.get("category") == "system", f"got {ts.get('category')}")
check("AC-2 tombstone before.buffered names the cleared count",
      isinstance(ts.get("before"), dict) and ts["before"].get("buffered") == pre_count,
      f"got {ts.get('before')}")

check("AC-3 lifetime_total increased by exactly 1 (the tombstone)",
      svc.summary()["lifetime_total"] == pre_lifetime + 1,
      f"got {svc.summary()['lifetime_total']}, expected {pre_lifetime + 1}")

# Disk should contain pre_count + 1 (tombstone) lines.
with open(log_path, "r", encoding="utf-8") as fh:
    disk_lines = [ln for ln in fh.read().splitlines() if ln.strip()]
check("AC-4 disk JSONL preserved + tombstone appended",
      len(disk_lines) == pre_count + 1,
      f"got {len(disk_lines)} disk lines, expected {pre_count + 1}")
check("AC-4 first disk entry is still 'bot_start'",
      json.loads(disk_lines[0])["action"] == "bot_start",
      f"got {json.loads(disk_lines[0])['action']}")
check("AC-4 last disk entry is the tombstone",
      json.loads(disk_lines[-1])["action"] == "audit_buffer_clear")

# ── AC-5: post-reset record() works normally ──────────────────────────────────
print("\nAC-5: post-reset record() continues to append to ring + disk")
svc.record(action="strategy_mode_change", actor="operator", category="config")
post = svc.list(limit=1000)
check("AC-5 ring grew to 2 (tombstone + new event)",
      len(post) == 2, f"got {len(post)}")
check("AC-5 newest entry is the new event (newest-first ordering)",
      post[0].get("action") == "strategy_mode_change",
      f"got {post[0].get('action')}")

# ── AC-6: idempotent shape on double-click ────────────────────────────────────
print("\nAC-6: clear_buffer is idempotent (double-click safe)")
svc.clear_buffer(actor="operator", reason="")
ring_after_double = svc.list(limit=1000)
check("AC-6 ring still contains exactly one entry after second clear",
      len(ring_after_double) == 1, f"got {len(ring_after_double)}")
check("AC-6 second tombstone has the same action slug",
      ring_after_double[0].get("action") == "audit_buffer_clear",
      f"got {ring_after_double[0].get('action')}")

# ── AC-7, AC-8: reason metadata semantics ─────────────────────────────────────
print("\nAC-7..8: reason metadata is round-tripped, empty reason is safe")
svc2, _ = fresh_service()
svc2.record(action="bot_start", actor="operator", category="lifecycle")
res = svc2.clear_buffer(actor="operator", reason="weekly housekeeping")
ts2 = svc2.list(limit=10)[0]
check("AC-7 reason text lands on tombstone metadata",
      isinstance(ts2.get("metadata"), dict) and ts2["metadata"].get("reason") == "weekly housekeeping",
      f"got {ts2.get('metadata')}")

svc3, _ = fresh_service()
svc3.record(action="bot_start", actor="operator", category="lifecycle")
res3 = svc3.clear_buffer(actor="operator", reason="")
ts3 = svc3.list(limit=10)[0]
check("AC-8 empty reason yields empty metadata dict (no crash, no key)",
      ts3.get("metadata") == {} or ts3.get("metadata") is None,
      f"got {ts3.get('metadata')}")

# ── Result ────────────────────────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"audit_service.clear_buffer: {passed} passed, {failed} failed")
print(f"{'='*60}")
sys.exit(0 if failed == 0 else 1)