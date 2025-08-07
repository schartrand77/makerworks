# app/email.py
import logging


def send_login_email(email: str):
    logging.info(f"[email] Login notification sent to {email}")
