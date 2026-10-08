"""Smoke test: weekly counselling schedule, doctor-style slot booking, phone on register."""
import os
import sys

import requests

BASE = os.environ.get("API", "http://localhost:8000/api/v1")

failures = []


def check(name, cond, extra=""):
    tag = "ok " if cond else "FAIL"
    print(f"[{tag}] {name} {extra}")
    if not cond:
        failures.append(name)


def login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password}, timeout=20)
    if r.status_code != 200:
        return None, r.text
    return r.json()["access_token"], r.text


def hdr(token):
    return {"Authorization": f"Bearer {token}"}


# 1. public counsellor directory
r = requests.get(f"{BASE}/counselling/counsellors", timeout=20)
check("public counsellor list", r.status_code == 200, f"({r.status_code})")
counsellors = r.json() if r.status_code == 200 else []
seeded = next((c for c in counsellors if c["name"] == "Demo Counsellor"), None)
check("seeded counsellor listed with profile", bool(seeded) and bool(seeded.get("specialty")))
check("counsellor shows weekly pattern", bool(seeded) and len(seeded.get("weekly") or []) >= 1,
      str((seeded or {}).get("weekly"))[:100])
check("counsellor shows next_available", bool(seeded) and bool(seeded.get("next_available")))
check("counsellor shows free slot count", bool(seeded) and (seeded.get("upcoming_slots") or 0) > 0,
      f"free={((seeded or {}).get('upcoming_slots'))}")
cid = (seeded or {}).get("id")

# 1b. next available slots across counsellors
r = requests.get(f"{BASE}/counselling/upcoming-slots", params={"limit": 5}, timeout=20)
upcoming = r.json() if r.status_code == 200 else []
check("upcoming slots list", r.status_code == 200 and len(upcoming) >= 1, f"({r.status_code}) count={len(upcoming)}")
check("upcoming slot has counsellor name", bool(upcoming) and bool(upcoming[0].get("counsellor_name")))

# 2. dates with free slots
r = requests.get(f"{BASE}/counselling/dates", params={"counsellor_id": cid}, timeout=20)
dates = r.json() if r.status_code == 200 else []
check("dates list with free counts", r.status_code == 200 and len(dates) >= 1, f"({r.status_code}) dates={dates[:3]}")
check("date rows carry free + total", bool(dates) and "total" in dates[0] and "free" in dates[0],
      str(dates[:2])[:140])
if not dates:
    print("no dates available - cannot continue")
    sys.exit(1)
day = max(dates, key=lambda d: d.get("free") or 0)["date"]

# 3. slots for that day
r = requests.get(f"{BASE}/counselling/slots", params={"counsellor_id": cid, "date": day}, timeout=20)
payload = r.json() if r.status_code == 200 else {}
slots = payload.get("slots", [])
check("slots list for date", r.status_code == 200 and len(slots) >= 1, f"({r.status_code}) count={len(slots)}")
both_slot = next((s for s in slots if s["mode"] == "both" and s["available"]), None)
any_slot = next((s for s in slots if s["available"]), None)
check("slot exposes schedule_id + seats", bool(slots) and "schedule_id" in slots[0] and "seats_left" in slots[0])

# 4. both-mode slot needs an explicit mode
if both_slot:
    r = requests.post(
        f"{BASE}/counselling/book",
        json={"schedule_id": both_slot["schedule_id"], "slot_start": both_slot["start"],
              "name": "No Mode", "email": "nomode.smoke@example.com"},
        timeout=20,
    )
    check("both-mode slot without mode -> 400", r.status_code == 400, f"({r.status_code})")
else:
    check("both-mode slot present", False, "no free slot with mode=both")

# 5. guest booking
if any_slot:
    guest = {
        "schedule_id": any_slot["schedule_id"],
        "slot_start": any_slot["start"],
        "name": "Guest Visitor",
        "email": "guest.smoke@example.com",
        "phone": "+94711111111",
        "note": "exam stress",
        "mode": any_slot["mode"] if any_slot["mode"] in ("online", "in_person") else "in_person",
    }
    r = requests.post(f"{BASE}/counselling/book", json=guest, timeout=20)
    check("guest books a slot (no token)", r.status_code == 200, f"({r.status_code}) {r.text[:140]}")
    booking_id = r.json().get("id") if r.status_code == 200 else None
    if r.status_code == 200:
        data = r.json()
        check("booking returns slot + counsellor", bool(data.get("slot_start")) and bool(data.get("counsellor_name")))
        check("booking stores chosen mode", data.get("mode") == guest["mode"], str(data.get("mode")))
        check("booking stores duration/title", bool(data.get("duration_min")) and bool(data.get("title")))

    # 6. the slot is now gone for everybody else
    r = requests.post(
        f"{BASE}/counselling/book",
        json={**guest, "email": "someoneelse.smoke@example.com"},
        timeout=20,
    )
    check("taken slot rejected -> 409", r.status_code == 409, f"({r.status_code})")

    r = requests.post(f"{BASE}/counselling/book", json=guest, timeout=20)
    check("duplicate email on slot -> 409", r.status_code == 409, f"({r.status_code})")

    r = requests.get(f"{BASE}/counselling/slots", params={"counsellor_id": cid, "date": day}, timeout=20)
    after = r.json().get("slots", []) if r.status_code == 200 else []
    hit = next((s for s in after if s["start"] == any_slot["start"]), None)
    check("booked slot marked unavailable", bool(hit) and hit["available"] is False,
          f"available={(hit or {}).get('available')}")
else:
    check("guest booking scenario", False, "no free slot")
    booking_id = None

# 7. counsellor login + weekly schedule CRUD
ctok, txt = login("counsellor@example.com", "Counsellor@123")
check("counsellor login", ctok is not None, txt[:80])
if not ctok:
    sys.exit(1)

r = requests.get(f"{BASE}/counselling/my-schedules", headers=hdr(ctok), timeout=20)
schedules = r.json() if r.status_code == 200 else []
check("counsellor weekly schedule list", r.status_code == 200 and len(schedules) >= 3, f"({r.status_code}) count={len(schedules)}")
check("schedule rows are multi-day rules",
      any(len(s.get("weekdays") or []) >= 2 for s in schedules),
      str([s.get("weekdays") for s in schedules])[:140])
owned_id = schedules[0]["id"] if schedules else None

payload = {
    "title": "Smoke Test Hours",
    "description": "created by smoke test",
    "weekdays": [1, 3],
    "start_time": "18:00",
    "end_time": "20:00",
    "slot_minutes": 60,
    "mode": "online",
    "capacity": 1,
    "price": 0,
    "currency": "USD",
    "location": "Live online",
    "status": "active",
}
r = requests.post(f"{BASE}/counselling/schedules", json=payload, headers=hdr(ctok), timeout=20)
check("counsellor creates repeated session (Tue + Thu)", r.status_code == 200, f"({r.status_code}) {r.text[:140]}")
new_id = r.json().get("id") if r.status_code == 200 else None
check("created rule stores its weekdays", r.status_code == 200 and r.json().get("weekdays") == [1, 3],
      str((r.json() if r.status_code == 200 else {}).get("weekdays")))

if new_id:
    r = requests.post(
        f"{BASE}/counselling/schedules",
        json={**payload, "weekdays": [3], "start_time": "19:00", "end_time": "21:00"},
        headers=hdr(ctok),
        timeout=20,
    )
    check("overlapping weekly session -> 409", r.status_code == 409, f"({r.status_code})")

    r = requests.post(
        f"{BASE}/counselling/schedules",
        json={**payload, "weekdays": [9]},
        headers=hdr(ctok),
        timeout=20,
    )
    check("invalid weekday -> 422", r.status_code == 422, f"({r.status_code})")

    r = requests.get(f"{BASE}/counselling/slots",
                     params={"counsellor_id": cid, "date": "2099-01-04"}, timeout=20)
    check("slots endpoint answers far-future date", r.status_code == 200, f"({r.status_code})")

    r = requests.patch(f"{BASE}/counselling/schedules/{new_id}", json={"title": "Smoke Test Hours (edited)"},
                       headers=hdr(ctok), timeout=20)
    check("counsellor edits weekly session", r.status_code == 200 and r.json().get("title").endswith("(edited)"),
          f"({r.status_code})")

# 8. lecturer cannot create
ltok, _ = login("lecturer@example.com", "Lecturer@123")
if ltok:
    r = requests.post(f"{BASE}/counselling/schedules", json=payload, headers=hdr(ltok), timeout=20)
    check("lecturer create schedule -> 403", r.status_code == 403, f"({r.status_code})")

# 9. admin creates a second counsellor who cannot touch the first one's sessions
atok, _ = login("admin@example.com", "Admin@123")
check("admin login", atok is not None)
c2tok = None
if atok:
    r = requests.post(
        f"{BASE}/users",
        json={"name": "Second Counsellor", "email": "counsellor2.smoke@example.com",
              "password": "Counsellor@123", "role": "counselor"},
        headers=hdr(atok),
        timeout=20,
    )
    check("admin creates counselor user", r.status_code == 200, f"({r.status_code}) {r.text[:120]}")
    c2tok, _ = login("counsellor2.smoke@example.com", "Counsellor@123")
    check("second counsellor login", c2tok is not None)

if c2tok and owned_id:
    r = requests.patch(f"{BASE}/counselling/schedules/{owned_id}", json={"title": "Hijacked"},
                       headers=hdr(c2tok), timeout=20)
    check("other counsellor PATCH schedule -> 403", r.status_code == 403, f"({r.status_code})")
    r = requests.get(f"{BASE}/counselling/bookings", params={"schedule_id": owned_id}, headers=hdr(c2tok), timeout=20)
    check("other counsellor bookings -> 403", r.status_code == 403, f"({r.status_code})")
    r = requests.get(f"{BASE}/counselling/bookings", headers=hdr(c2tok), timeout=20)
    check("other counsellor sees only own bookings", r.status_code == 200 and r.json() == [], f"({r.status_code})")
    r = requests.get(f"{BASE}/counselling/stats", headers=hdr(c2tok), timeout=20)
    check("second counsellor stats scoped",
          r.status_code == 200 and r.json()["stats"]["active_schedules"] == 0, f"({r.status_code})")

# 10. owner reads bookings for a schedule + marks attended / cancels
if ctok and owned_id:
    r = requests.get(f"{BASE}/counselling/bookings", params={"schedule_id": owned_id}, headers=hdr(ctok), timeout=20)
    owned = r.json() if r.status_code == 200 else []
    check("schedule booking list is scoped to that schedule",
          r.status_code == 200 and all(b["schedule_id"] == owned_id for b in owned), f"({r.status_code})")

    r = requests.get(f"{BASE}/counselling/bookings", headers=hdr(ctok), timeout=20)
    allb = r.json() if r.status_code == 200 else []
    guest_b = next((b for b in allb if b.get("id") == booking_id), None) if booking_id else None
    check("owner sees the guest booking", guest_b is not None, f"({r.status_code})")
    if guest_b:
        r = requests.patch(f"{BASE}/counselling/bookings/{guest_b['id']}", json={"status": "attended"},
                           headers=hdr(ctok), timeout=20)
        check("owner marks attended", r.status_code == 200 and r.json()["status"] == "attended", f"({r.status_code})")
        # cancelling frees the slot again
        r = requests.patch(f"{BASE}/counselling/bookings/{guest_b['id']}", json={"status": "cancelled"},
                           headers=hdr(ctok), timeout=20)
        check("owner cancels booking", r.status_code == 200, f"({r.status_code})")
        r = requests.get(f"{BASE}/counselling/slots", params={"counsellor_id": cid, "date": day}, timeout=20)
        refree = next((s for s in (r.json().get("slots", []) if r.status_code == 200 else []) if s["available"]), None)
        if refree:
            r = requests.post(
                f"{BASE}/counselling/book",
                json={"schedule_id": refree["schedule_id"], "slot_start": refree["start"],
                      "name": "Slot Refreed", "email": "refreed.smoke@example.com",
                      "mode": refree["mode"] if refree["mode"] in ("online", "in_person") else "online"},
                timeout=20,
            )
            check("cancelled slot can be booked again", r.status_code == 200,
                  f"({r.status_code}) {r.text[:120]}")
        else:
            check("cancelled slot can be booked again", False, "no free slot left to rebook")

# 11. stats shape
r = requests.get(f"{BASE}/counselling/stats", headers=hdr(ctok), timeout=20)
stats = r.json() if r.status_code == 200 else {}
check("counsellor stats", r.status_code == 200 and "stats" in stats and "next_bookings" in stats, f"({r.status_code})")
check("stats has open slots", stats.get("stats", {}).get("open_slots", 0) >= 0,
      str(stats.get("stats", {}))[:160])

# 12. signed-in booking + my-bookings
if atok:
    r = requests.get(f"{BASE}/counselling/slots", params={"counsellor_id": cid, "date": day}, timeout=20)
    fresh = r.json().get("slots", []) if r.status_code == 200 else []
    other = next((s for s in fresh if s["available"] and s["start"] != ((any_slot or {}).get("start"))), None)
    if other:
        r = requests.post(
            f"{BASE}/counselling/book",
            json={"schedule_id": other["schedule_id"], "slot_start": other["start"],
                  "name": "Admin Booker", "email": "admin.book@example.com",
                  "mode": other["mode"] if other["mode"] in ("online", "in_person") else "online"},
            headers=hdr(atok),
            timeout=20,
        )
        online = r.json() if r.status_code == 200 else {}
        check("signed-in booking attaches user", r.status_code == 200 and online.get("user_id"),
              f"({r.status_code}) {r.text[:140]}")
        check("online booking has zoom link or note",
              bool(online.get("join_url") or online.get("meeting_note")),
              f"join_url={bool(online.get('join_url'))} note={online.get('meeting_note')}")
        r = requests.get(f"{BASE}/counselling/my-bookings", headers=hdr(atok), timeout=20)
        check("my-bookings returns booking with counsellor",
              r.status_code == 200 and any(b["email"] == "admin.book@example.com" and b.get("counsellor_name")
                                           for b in r.json()),
              f"({r.status_code})")
    else:
        check("signed-in booking scenario", False, "no second free slot")

# 13. registration requires a phone number
r = requests.post(f"{BASE}/auth/register",
                  json={"name": "No Phone", "email": "nophone.smoke@example.com", "password": "Secret123"},
                  timeout=20)
check("register without phone -> 422", r.status_code == 422, f"({r.status_code})")
r = requests.post(f"{BASE}/auth/register",
                  json={"name": "Phone User", "email": "phoneuser.smoke@example.com",
                        "password": "Secret123", "phone": "+94771234567"},
                  timeout=20)
check("register with phone succeeds", r.status_code in (200, 201), f"({r.status_code}) {r.text[:120]}")

# 14. cleanup: delete the smoke schedule, cancel smoke bookings, remove temp users
if ctok and new_id:
    r = requests.delete(f"{BASE}/counselling/schedules/{new_id}", headers=hdr(ctok), timeout=20)
    check("counsellor deletes weekly session", r.status_code == 200, f"({r.status_code})")

if ctok:
    r = requests.get(f"{BASE}/counselling/bookings", headers=hdr(ctok), timeout=20)
    for b in (r.json() if r.status_code == 200 else []):
        email = str(b.get("email", ""))
        if email.endswith(".smoke@example.com") or email == "admin.book@example.com":
            requests.patch(f"{BASE}/counselling/bookings/{b['id']}", json={"status": "cancelled"},
                           headers=hdr(ctok), timeout=20)

if atok:
    for email in ("counsellor2.smoke@example.com", "phoneuser.smoke@example.com"):
        r = requests.get(f"{BASE}/users", params={"q": email, "size": 10}, headers=hdr(atok), timeout=20)
        for u in (r.json().get("items", []) if r.status_code == 200 else []):
            if u.get("email") == email:
                requests.delete(f"{BASE}/users/{u['id']}", headers=hdr(atok), timeout=20)

print()
if failures:
    print(f"FAILED: {len(failures)} -> {failures}")
    sys.exit(1)
print("ALL COUNSELLING SMOKE TESTS PASSED")
