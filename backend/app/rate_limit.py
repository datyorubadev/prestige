from slowapi import Limiter
from slowapi.util import get_remote_address

# Global limiter instance – can be imported by any router module
limiter = Limiter(key_func=get_remote_address)
