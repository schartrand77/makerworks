# app/models/base.py

"""
Base declarative class for SQLAlchemy models.

All ORM models should inherit from `Base` defined here.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base class for all database models."""
    pass
