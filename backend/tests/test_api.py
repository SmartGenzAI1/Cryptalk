import pytest
import os

os.environ.setdefault("SESSION_SECRET", "test-secret-do-not-use-in-production-32chars")

from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


class TestAuth:
    def test_register_missing_email(self, client):
        res = client.post("/api/auth/register", json={"password": "test"})
        assert res.status_code == 422

    def test_register_short_password(self, client):
        res = client.post("/api/auth/register", json={"email": "a@b.com", "password": "ab"})
        assert res.status_code in (400, 422)

    def test_login_invalid(self, client):
        res = client.post("/api/auth/login", json={"email": "nobody@test.com", "password": "wrong"})
        assert res.status_code == 401

    def test_me_without_auth(self, client):
        res = client.get("/api/auth/me")
        assert res.status_code == 200
        assert res.json()["user"] is None

    def test_logout(self, client):
        res = client.post("/api/auth/logout")
        assert res.status_code == 200


class TestChats:
    def test_get_chats_unauthorized(self, client):
        res = client.get("/api/chats")
        assert res.status_code == 401

    def test_create_chat_unauthorized(self, client):
        res = client.post("/api/chats", json={"type": "group", "title": "Test"})
        assert res.status_code == 401


class TestMessages:
    def test_mark_read_unauthorized(self, client):
        res = client.post("/api/chats/0123456789abcdef01234567/mark-read")
        assert res.status_code == 401


class TestSocial:
    def test_connections_unauthorized(self, client):
        res = client.get("/api/social/connections")
        assert res.status_code == 401

    def test_block_unauthorized(self, client):
        res = client.post("/api/social/block", json={"user_id": "0123456789abcdef01234567"})
        assert res.status_code == 401


class TestE2EE:
    def test_upload_keys_unauthorized(self, client):
        res = client.post("/api/keys/upload", json={
            "identity_public_key": "test",
            "signing_public_key": "test",
            "signed_prekey_public": "test",
            "signed_prekey_signature": "test",
        })
        assert res.status_code == 401

    def test_get_keys_unauthorized(self, client):
        res = client.get("/api/keys/0123456789abcdef01234567")
        assert res.status_code == 401


class TestChatManagement:
    def test_leave_chat_unauthorized(self, client):
        res = client.post("/api/chats/0123456789abcdef01234567/leave")
        assert res.status_code == 401

    def test_delete_chat_unauthorized(self, client):
        res = client.delete("/api/chats/0123456789abcdef01234567")
        assert res.status_code == 401

    def test_report_unauthorized(self, client):
        res = client.post("/api/reports", json={"reason": "spam"})
        assert res.status_code == 401

    def test_delete_account_unauthorized(self, client):
        res = client.delete("/api/account")
        assert res.status_code == 401


class TestHealth:
    def test_root(self, client):
        res = client.get("/")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"

    def test_health(self, client):
        res = client.get("/health")
        assert res.status_code in (200, 503)
        assert res.json()["status"] in ("healthy", "ok")
