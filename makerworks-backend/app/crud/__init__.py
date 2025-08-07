# app/crud/__init__.py

from .users import (
    create_local_user,
    delete_user,
    get_user_by_email,
    get_user_by_id,
    update_last_login,
    update_user_profile,
)
