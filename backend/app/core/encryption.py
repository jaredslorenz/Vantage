from cryptography.fernet import Fernet
from app.core.config import settings

_fernet = Fernet(settings.token_encryption_key.encode())


def encrypt_token(token: str) -> str:
    return _fernet.encrypt(token.encode()).decode()


def decrypt_token(token: str) -> str:
    return _fernet.decrypt(token.encode()).decode()
