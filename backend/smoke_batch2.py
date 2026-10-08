import json, urllib.request, urllib.error, uuid

BASE = "http://localhost:8000/api/v1"
PROG = "bbbcfbae9acc466dae164e788198a9f6"

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
        status, payload = e.code, (json.load(e) if e.headers.get("content-type", "").startswith("application/json") else e.read().decode()[:200])
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
    s, p = req("/auth/login", "POST", {"email": email, "password": password})
    return p.get("access_token")

admin = login("admin@example.com", "Admin@123")
student = login("student@test.com", "Student123")
lecturer = login("lecturer@example.com", "Lecturer@123")
assert admin and student and lecturer, "login failed"
print("logins ok")

# 1. membership plans (already verified above) — pricing preview with promo + membership
_, q0 = req("/pricing/preview", "POST", {"programme_id": PROG}, student)
print("   base:", q0["base_amount"], "member%:", q0["member_discount_percent"], "amount:", q0["amount"])
_, q1 = req("/pricing/preview", "POST", {"programme_id": PROG, "promo_code": "WELCOME25"}, student)
print("   with promo:", q1["amount"], "promo:", q1["promo_code"], q1["promo_discount_percent"], "err:", q1["promo_error"])
assert q1["promo_code"] == "WELCOME25" and q1["amount"] < q0["amount"], "promo did not apply"
# expired / bogus code
_, q2 = req("/pricing/preview", "POST", {"programme_id": PROG, "promo_code": "NOPE99"}, student)
assert q2["amount"] == q0["amount"] and q2["promo_error"], "bogus promo should not change price"
print("PASS bogus promo rejected:", q2["promo_error"])

# 2. admin promo CRUD
_, promos = req("/promos", token=admin)
assert any(p["code"] == "WELCOME25" for p in promos)
code = "SMOKE" + uuid.uuid4().hex[:4].upper()
_, created = req("/promos", "POST", {"code": code, "discount_percent": 40, "scope": "all",
                                     "starts_at": "2020-01-01T00:00:00Z", "ends_at": "2030-01-01T23:59:59Z"}, admin)
_, q3 = req("/pricing/preview", "POST", {"programme_id": PROG, "promo_code": code}, student)
assert q3["promo_discount_percent"] == 40, q3
print("PASS new promo applies:", q3["amount"])
req(f"/promos/{created['id']}", "DELETE", token=admin, expect=200)
req("/promos", "GET", token=student, expect=403)

# 3. expired promo window
_, expired = req("/promos", "POST", {"code": "OLD" + uuid.uuid4().hex[:4].upper(), "discount_percent": 90,
                                     "scope": "all", "starts_at": "2020-01-01T00:00:00Z",
                                     "ends_at": "2020-02-01T00:00:00Z"}, admin)
_, q4 = req("/pricing/preview", "POST", {"programme_id": PROG, "promo_code": expired["code"]}, student)
assert q4["amount"] == q0["amount"] and q4["promo_error"], q4
print("PASS expired promo rejected:", q4["promo_error"])
req(f"/promos/{expired['id']}", "DELETE", token=admin, expect=200)

# 4. ownership: lecturer creates a course, another lecturer gets 403, admin/owner can edit
_, new_prog = req("/programmes", "POST", {"type": "course", "title": "Ownership Smoke " + uuid.uuid4().hex[:6],
                                          "price": 10, "currency": "LKR", "status": "draft"}, lecturer)
pid = new_prog["id"]
other_email = f"other{uuid.uuid4().hex[:6]}@test.com"
req("/users", "POST", {"name": "Other Lecturer", "email": other_email, "password": "Other@123", "role": "lecturer"}, admin)
_, p2 = req("/auth/login", "POST", {"email": other_email, "password": "Other@123"})
other_token = p2.get("access_token")
full = {"type": "course", "title": "Hacked", "summary": "", "description": "", "category": "", "level": "Beginner",
        "duration": "", "price": 10, "currency": "LKR", "pricing_mode": "once", "billing_interval": None,
        "is_free": False, "status": "draft"}
req(f"/programmes/{pid}", "PUT", full, other_token, expect=403)
req(f"/programmes/{pid}/subjects", "POST", {"title": "Sneaky"}, other_token, expect=403)
full["title"] = "Ownership Smoke edited"
req(f"/programmes/{pid}", "PUT", full, lecturer, expect=200)
req(f"/programmes/{pid}", "DELETE", token=admin, expect=200)

# 5. banners admin-only management
req("/banners?active_only=false", token=student, expect=403)
_, all_b = req("/banners?active_only=false", token=admin)
assert len(all_b) >= 3

# 6. settings currencies
_, st = req("/settings")
assert "LKR" in (st.get("currencies") or ""), st.get("currencies")
print("PASS currencies:", st.get("currencies"))

# 7. websocket endpoint: raw handshake must return 101
import socket, base64, os
key = base64.b64encode(os.urandom(16)).decode()
s = socket.create_connection(("localhost", 8000), timeout=5)
s.sendall(("GET /api/v1/ws HTTP/1.1\r\nHost: localhost:8000\r\nUpgrade: websocket\r\n"
           "Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n" % key).encode())
line = s.recv(4096).split(b"\r\n", 1)[0].decode()
s.close()
assert "101" in line, line
print("PASS ws handshake:", line)

# 8. membership discount stacks with promo
_, plans = req("/membership-plans", token=student)
vip = next((p for p in plans if (p.get("discount_percent") or 0) == 100), None)
if vip:
    _, membership = req("/memberships", "POST", {"plan_id": vip["id"], "method": "manual", "cycle": "monthly"}, student)
    pay_id = (membership.get("payment") or {}).get("id") if isinstance(membership, dict) else None
    if not pay_id:
        _, mine = req("/payments/mine", token=student)
        cand = [p for p in mine if p.get("purpose") == "membership" and p.get("status") == "awaiting_verification"]
        pay_id = cand[-1]["id"] if cand else None
    req(f"/payments/{pay_id}/verify", "POST", {"status": "succeeded", "notes": "smoke"}, admin)
    _, q5 = req("/pricing/preview", "POST", {"programme_id": PROG, "promo_code": "WELCOME25"}, student)
    print("   VIP member + promo quote:", q5["amount"], "member%:", q5["member_discount_percent"])
    assert q5["member_discount_percent"] == 100 and q5["amount"] == 0, q5
    print("PASS 100% membership + promo => 0")
else:
    print("FAIL no 100% plan found")

# 9. cleanup: leftovers from earlier runs + membership smoke state
import subprocess
def mongo_eval(expr):
    subprocess.run(["docker", "exec", "lms-mongo-1", "mongosh", "--quiet", "--eval",
                    'db = db.getSiblingDB("lms"); ' + expr], check=False)
mongo_eval('db.programmes.deleteMany({title: /^Ownership Smoke/});')
if vip:
    mongo_eval('db.memberships.deleteMany({_id: "' + membership["id"] + '"});')
mongo_eval('db.payments.deleteMany({purpose: "membership", status: "succeeded", created_at: {$gte: new Date(Date.now() - 900000)}});')
print("cleanup done")

print("SMOKE DONE")
