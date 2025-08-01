import os
import asyncio
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import sessionmaker
import shutil

from app.db.session import async_engine
from app.models.models import ModelUpload, User

BASE_UPLOAD_DIR = Path("uploads").resolve()  # adjust if needed

async def sync_uploads():
    async_session = sessionmaker(async_engine, expire_on_commit=False, class_=AsyncSession)
    async with async_session() as session:
        # Fetch all models
        result = await session.execute(select(ModelUpload))
        models = result.scalars().all()

        fixed_count = 0
        missing_files = []

        for model in models:
            user_id = str(model.user_id)
            correct_model_path = f"users/{user_id}/models/{Path(model.filename).name}"
            correct_thumb_path = f"users/{user_id}/thumbnails/{model.id}_thumb.png"
            correct_turntable_path = f"users/{user_id}/models/{model.id}.webm"

            # Check actual filesystem
            abs_model_path = BASE_UPLOAD_DIR / correct_model_path
            abs_thumb_path = BASE_UPLOAD_DIR / correct_thumb_path

            # If current file_path doesn't match expected user folder, move and update
            current_abs_model = BASE_UPLOAD_DIR / model.file_path
            if not abs_model_path.exists() and current_abs_model.exists():
                abs_model_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(current_abs_model), str(abs_model_path))
                print(f"📦 Moved model file to {abs_model_path}")

            # If current thumbnail path doesn't match, move and update
            current_abs_thumb = BASE_UPLOAD_DIR / model.thumbnail_path
            if not abs_thumb_path.exists() and current_abs_thumb.exists():
                abs_thumb_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(current_abs_thumb), str(abs_thumb_path))
                print(f"🖼️ Moved thumbnail to {abs_thumb_path}")

            # Update DB paths if incorrect
            updated = False
            if model.file_path != correct_model_path:
                model.file_path = correct_model_path
                model.file_url = f"/uploads/{correct_model_path}"
                updated = True
            if model.thumbnail_path != correct_thumb_path:
                model.thumbnail_path = correct_thumb_path
                updated = True
            if model.turntable_path != correct_turntable_path:
                model.turntable_path = correct_turntable_path
                updated = True

            # Commit updates
            if updated:
                fixed_count += 1
                session.add(model)

            # Track missing files
            if not abs_model_path.exists():
                missing_files.append((model.id, abs_model_path))

        await session.commit()

        print(f"✅ Sync complete. Fixed {fixed_count} models.")
        if missing_files:
            print("⚠️ Missing model files:")
            for mid, path in missing_files:
                print(f" - {mid}: {path}")

if __name__ == "__main__":
    asyncio.run(sync_uploads())
