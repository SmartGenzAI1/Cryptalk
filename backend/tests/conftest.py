import os

# Ensure test session secret is at least 32 characters
os.environ["SESSION_SECRET"] = "ci-test-only-not-a-real-secret-32chars!"
# Ensure default database uses SQLite for testing if not explicitly configured
if not os.environ.get("DATABASE_URL"):
    os.environ["DATABASE_URL"] = ""
