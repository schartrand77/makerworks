#!/usr/bin/env python

import argparse
import asyncio
import sys

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import async_session_maker
from app.models.models import User
from app.utils.log_utils import logger


async def list_users():
    async with async_session_maker() as db:  # type: AsyncSession
        result = await db.execute(select(User))
        users = result.scalars().all()

        if not users:
            logger.info("ℹ️  No users found.")
            return

        print(f"\n{'Email':<30} {'Username':<20} {'Role':<10}")
        print("-" * 65)
        for u in users:
            print(f"{u.email:<30} {u.username:<20} {u.role:<10}")
        print()


async def change_user_role(email: str, role: str):
    async with async_session_maker() as db:  # type: AsyncSession
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if not user:
            logger.error(f"❌ User with email {email} not found.")
            sys.exit(1)

        if user.role == role:
            logger.info(f"ℹ️  User {email} already has role '{role}'.")
            return

        # safeguard: don't demote the last admin
        if role == "user" and user.role == "admin":
            result = await db.execute(
                select(func.count()).select_from(User).where(User.role == "admin")
            )
            admin_count = result.scalar()
            if admin_count == 1:
                logger.error(f"🚫 Cannot demote the last admin: {email}")
                sys.exit(1)

        logger.info(f"🔄 Changing role for {email} from '{user.role}' → '{role}'")
        user.role = role
        await db.commit()
        logger.info(f"✅ Role updated successfully: {email} → {role}")


def main():
    parser = argparse.ArgumentParser(description="Manage user roles.")
    parser.add_argument(
        "--list", action="store_true", help="List all users and their roles."
    )
    parser.add_argument("--email", help="Email of the user to update.")
    parser.add_argument(
        "--role", choices=["admin", "user"], help="New role for the user."
    )

    args = parser.parse_args()

    if args.list:
        asyncio.run(list_users())
    elif args.email and args.role:
        asyncio.run(change_user_role(args.email, args.role))
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
