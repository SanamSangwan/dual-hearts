"""OurSpace backend end-to-end tests"""
import os
import uuid
import base64
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://dual-hearts-app.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# 1x1 red PNG
TINY_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI"
    "7wAAAABJRU5ErkJggg=="
)


def _rand_email(prefix):
    return f"{prefix}+{uuid.uuid4().hex[:8]}@gmail.com"


@pytest.fixture(scope="module")
def userA():
    email = _rand_email("alex")
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Love1234!", "name": "Alex"})
    assert r.status_code == 200, r.text
    d = r.json()
    return {"email": email, "password": "Love1234!", "token": d["access_token"], "user": d["user"]}


@pytest.fixture(scope="module")
def userB():
    email = _rand_email("sam")
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "Love1234!", "name": "Sam"})
    assert r.status_code == 200, r.text
    d = r.json()
    return {"email": email, "password": "Love1234!", "token": d["access_token"], "user": d["user"]}


def H(t):
    return {"Authorization": f"Bearer {t}"}


# --- Auth ---
class TestAuth:
    def test_health(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_register_duplicate(self, userA):
        r = requests.post(f"{API}/auth/register", json={"email": userA["email"], "password": "x123456"})
        assert r.status_code == 400

    def test_login_success(self, userA):
        r = requests.post(f"{API}/auth/login", data={"username": userA["email"], "password": userA["password"]})
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_login_wrong_password(self, userA):
        r = requests.post(f"{API}/auth/login", data={"username": userA["email"], "password": "WRONG!!"})
        assert r.status_code == 401

    def test_me_unpaired(self, userA):
        r = requests.get(f"{API}/auth/me", headers=H(userA["token"]))
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["email"] == userA["email"]
        assert d["partner"] is None

    def test_me_no_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# --- Pairing ---
class TestPairing:
    def test_full_pair_flow(self, userA, userB):
        # gesture unpaired should 400
        r = requests.post(f"{API}/gestures", json={"type": "kiss"}, headers=H(userA["token"]))
        assert r.status_code == 400

        # A creates code
        r = requests.post(f"{API}/couple/create", headers=H(userA["token"]))
        assert r.status_code == 200
        code = r.json()["code"]
        assert len(code) == 6

        # second create should fail
        r2 = requests.post(f"{API}/couple/create", headers=H(userA["token"]))
        assert r2.status_code == 400

        # B joins
        r = requests.post(f"{API}/couple/join", json={"code": code}, headers=H(userB["token"]))
        assert r.status_code == 200
        assert r.json()["paired"] is True

        # both see each other as partner
        ra = requests.get(f"{API}/auth/me", headers=H(userA["token"])).json()
        rb = requests.get(f"{API}/auth/me", headers=H(userB["token"])).json()
        assert ra["partner"] and ra["partner"]["email"] == userB["email"]
        assert rb["partner"] and rb["partner"]["email"] == userA["email"]

    def test_invalid_code(self, userA, userB):
        # need a fresh user
        email = _rand_email("carol")
        d = requests.post(f"{API}/auth/register", json={"email": email, "password": "Love1234!"}).json()
        r = requests.post(f"{API}/couple/join", json={"code": "ZZZZZZ"}, headers=H(d["access_token"]))
        assert r.status_code == 404


# --- Gestures ---
class TestGestures:
    def test_send_kiss_heart_miss(self, userA, userB):
        for t in ("kiss", "heart", "miss"):
            r = requests.post(f"{API}/gestures", json={"type": t, "message": f"hi {t}"}, headers=H(userA["token"]))
            assert r.status_code == 200, r.text
            assert r.json()["type"] == t

    def test_invalid_type(self, userA):
        r = requests.post(f"{API}/gestures", json={"type": "hug"}, headers=H(userA["token"]))
        assert r.status_code == 400

    def test_list_reverse_chrono(self, userA, userB):
        r = requests.get(f"{API}/gestures", headers=H(userB["token"]))
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 3
        # reverse chrono
        ts = [i["createdAt"] for i in items]
        assert ts == sorted(ts, reverse=True)
        # partner sees A's gestures
        assert any(i["senderId"] == userA["user"]["id"] for i in items)

    def test_stats(self, userA):
        r = requests.get(f"{API}/gestures/stats", headers=H(userA["token"]))
        assert r.status_code == 200
        d = r.json()
        assert d["total"] >= 3
        for k in ("kiss", "heart", "miss"):
            assert d["byType"][k] >= 1


# --- Wardrobe (AI) ---
class TestWardrobe:
    def test_generate_and_list(self, userA):
        r = requests.post(
            f"{API}/wardrobe/generate",
            json={"imageBase64": TINY_PNG_B64, "prompt": "a red hoodie"},
            headers=H(userA["token"]),
            timeout=180,
        )
        # Treat 502/504 as flaky
        if r.status_code in (502, 504):
            pytest.skip(f"AI flaky: {r.status_code}")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("imageBase64")
        # verify persisted
        lr = requests.get(f"{API}/wardrobe/looks", headers=H(userA["token"]))
        assert lr.status_code == 200
        assert any(x["id"] == d["id"] for x in lr.json()["items"])

    def test_list_empty_for_new_user(self):
        email = _rand_email("empty")
        tok = requests.post(f"{API}/auth/register", json={"email": email, "password": "Love1234!"}).json()["access_token"]
        r = requests.get(f"{API}/wardrobe/looks", headers=H(tok))
        assert r.status_code == 200
        assert r.json()["items"] == []
