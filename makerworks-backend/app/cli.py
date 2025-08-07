import asyncio
import os
from functools import wraps

import click

from alembic import command
from alembic.config import Config

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ALEMBIC_INI = os.path.join(PROJECT_ROOT, "alembic.ini")


@click.group()
def cli() -> None:
    """MakerWorks command line interface."""
    pass


def run_async(func):
    """Run async function and handle errors with a friendly message."""

    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            asyncio.run(func(*args, **kwargs))
        except Exception as exc:  # pragma: no cover - just logging
            click.secho(f"❌ {exc}", fg="red")
            raise click.ClickException(str(exc)) from exc

    return wrapper


@cli.group()
def update() -> None:
    """Update various system components."""
    pass


@update.command()
@click.argument("revision", default="head")
def alembic(revision: str) -> None:
    """Run Alembic migrations up to REVISION."""
    if not os.path.exists(ALEMBIC_INI):
        raise click.ClickException(f"alembic.ini not found: {ALEMBIC_INI}")

    cfg = Config(ALEMBIC_INI)
    command.upgrade(cfg, revision)
    click.echo(f"✅ Alembic upgraded to {revision}.")


@cli.group()
def db() -> None:
    """Database utilities."""
    pass


@db.command()
def init() -> None:
    """Create all database tables."""
    from app.init_db import init_models

    run_async(init_models)()
    click.echo("✅ Database tables created.")


@db.command()
def drop() -> None:
    """Drop all database tables."""
    from app.drop_db import drop_all

    run_async(drop_all)()
    click.echo("✅ Database tables dropped.")


@db.command()
def subset() -> None:
    """Create subset of tables (User, Filament)."""
    from app.init_subset import create_subset

    run_async(create_subset)()
    click.echo("✅ Subset tables created.")


@cli.group()
def users() -> None:
    """Manage users."""
    pass


@users.command("list")
def list_users_cmd() -> None:
    """List all users."""
    from app.scripts.user_role import list_users

    run_async(list_users)()


@users.command("change-role")
@click.option("--email", required=True, help="User email")
@click.option(
    "--role",
    type=click.Choice(["admin", "user"], case_sensitive=False),
    required=True,
    help="New role",
)
def change_role(email: str, role: str) -> None:
    """Change a user's role."""
    from app.scripts.user_role import change_user_role

    run_async(change_user_role)(email, role)


@cli.group()
def seed() -> None:
    """Seed initial data."""
    pass


@seed.command("filaments")
def seed_filaments_cmd() -> None:
    """Seed sample filaments."""
    from scripts.seed_filaments import seed_filaments

    run_async(seed_filaments)()
    click.echo("✅ Filaments seeded.")


if __name__ == "__main__":
    cli()
