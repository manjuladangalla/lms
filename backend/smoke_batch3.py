import json, urllib.request, urllib.error, uuid, datetime, subprocess

BASE = "http://localhost:8000/api/v1"

def req(path, method="GET", body=None, token=None, expect=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(r) as resp:
            status, payload = resp.status, json.load(resp)
    except urllib.error.HTTPError as e:
        ct = e.headers.get("content-type", "")
        status, payload = e.code, (json.load(e) if ct.startswith("application/json") else e.read().decode()[:200])
    if expect is None:
        ok = status < 400
    elif isinstance(expect, int):
        ok = status == expect
    else:
        ok = status in expect
    print(f"{'PASS' if ok else 'FAIL'} {method} {path} -> {status}" + ("" if ok else f" (expected {expect})"))
    if not ok:
        print("   ", payload)
    return status, payload

def login(email, password):
    _, p = req("/auth/login", "POST", {"email": email, "password": password})
    return p.get("access_token")

admin = login("admin@example.com", "Admin@123")
student = login("student@test.com", "Student123")
assert admin and student

def mongo_eval(expr):
    subprocess.run(["docker", "exec", "lms-mongo-1", "mongosh", "--quiet", "--eval",
                    'db = db.getSiblingDB("lms"); ' + expr], check=False)

sfx = uuid.uuid4().hex[:6]

# A. promo-code enrolment stores quote + claims usage
_, promo_row = None, None
_, all_promos = req("/promos", token=admin)
promo = next(p for p in all_promos if p["code"] == "WELCOME25")
used_before = promo.get("used_count") or 0

_, course = req("/programmes", "POST", {"type": "course", "title": "Promo Enrol Smoke " + sfx,
                                        "price": 100, "currency": "USD", "status": "published",
                                        "pricing_mode": "once"}, admin)
cid = course["id"]
_, en = req("/enrolments", "POST", {"programme_id": cid, "method": "manual", "promo_code": "WELCOME25"}, student)
print("   enrolment amount:", en.get("amount"), "base:", en.get("base_amount"),
      "member%:", en.get("member_discount"), "promo:", en.get("promo_code"), en.get("promo_discount_percent"))
assert en.get("amount") == 75.0 and en.get("promo_code") == "WELCOME25", en
_, all_promos2 = req("/promos", token=admin)
promo2 = next(p for p in all_promos2 if p["code"] == "WELCOME25")
assert (promo2.get("used_count") or 0) == used_before + 1, (used_before, promo2)
print("PASS promo claimed at enrolment; amount 75.0")

# B. semester interval expiry
_, course2 = req("/programmes", "POST", {"type": "course", "title": "Interval Smoke " + sfx,
                                         "price": 50, "currency": "LKR", "status": "published",
                                         "pricing_mode": "subscription", "billing_interval": "semester"}, admin)
c2 = course2["id"]
_, en2 = req("/enrolments", "POST", {"programme_id": c2, "method": "manual"}, student)
pay = en2.get("payment") or {}
_, mine = req("/payments/mine", token=student)
pid = next(p["id"] for p in mine if p.get("purpose") == "enrolment" and p.get("status") == "awaiting_verification"
           and p.get("amount") == 50)
req(f"/payments/{pid}/verify", "POST", {"status": "succeeded", "notes": "smoke"}, admin)
_, mine_en = req("/enrolments/mine", token=student)
row = next(e for e in mine_en if e["programme_id"] == c2)
exp = datetime.datetime.fromisoformat(row["access_expires_at"].replace("Z", "+00:00"))
days = (exp - datetime.datetime.now(datetime.timezone.utc)).days
print("   access_expires_at:", row["access_expires_at"], "-> days:", days)
assert 117 <= days <= 121, days
print("PASS semester = ~120 day access")
assert row.get("billing_interval") == "semester", row
print("PASS enrolment billing_interval stored:", row.get("billing_interval"))

# C. free preview of promo-enrolled price listing currency per course
_, prog = req(f"/programmes/{cid}")
assert prog["currency"] == "USD"

# cleanup
mongo_eval(f'db.programmes.deleteMany({{title: /{"Promo Enrol Smoke"}/}});')
mongo_eval(f'db.programmes.deleteMany({{title: /{"Interval Smoke"}/}});')
mongo_eval(f'db.enrolments.deleteMany({{programme_id: "{cid}"}});')
mongo_eval(f'db.enrolments.deleteMany({{programme_id: "{c2}"}});')
mongo_eval('db.payments.deleteMany({amount: 100});')
mongo_eval('db.payments.deleteMany({amount: 50, created_at: {$gte: new Date(Date.now() - 900000)}});')
mongo_eval('db.promos.updateOne({code: "WELCOME25"}, {$set: {used_count: 0}});')
print("cleanup done")
print("SMOKE2 DONE")
