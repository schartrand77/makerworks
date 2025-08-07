import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.base import Base
from app.models.models import (
    EstimateSettings,
    Filament,
    FilamentPricing,
    ModelMetadata,
    User,
)
from app.schemas.estimate import EstimateRequest
from app.services.estimate_service import calculate_estimate


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_local = sessionmaker(bind=engine)
    with session_local() as session:
        yield session


def seed_basic_data(session: Session):
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email="u@example.com",
        username="u",
        hashed_password="x" * 8,
    )
    model = ModelMetadata(
        id="1",
        filename="m.stl",
        filepath="/tmp/m.stl",
        name="Test",
        description="d",
        uploader=user_id,
        volume_mm3=1000,
    )
    filament = Filament(
        id="fil1",
        name="PLA Test",
        type="PLA",
        color="#fff",
        price_per_kg=20.0,
        is_active=True,
    )
    pricing = FilamentPricing(id="price1", filament_id="fil1", price_per_gram=0.05)
    settings = EstimateSettings(
        id="settings1", custom_text_base_cost=2.0, custom_text_cost_per_char=0.1
    )
    session.add_all([user, model, filament, pricing, settings])
    session.commit()


def test_calculate_estimate_success(db_session):
    seed_basic_data(db_session)
    req = EstimateRequest(
        model_id=1,
        x_mm=10,
        y_mm=10,
        z_mm=10,
        filament_type="PLA Test",
        filament_colors=["#fff"],
        print_profile="standard",
        custom_text="HI",
    )
    resp = calculate_estimate(req, db_session)
    assert resp.estimated_cost_usd > 0
    assert resp.estimated_time_minutes > 0


def test_calculate_estimate_model_not_found(db_session):
    with pytest.raises(ValueError):
        req = EstimateRequest(
            model_id=999,
            x_mm=1,
            y_mm=1,
            z_mm=1,
            filament_type="PLA Test",
            filament_colors=["#fff"],
            print_profile="standard",
        )
        calculate_estimate(req, db_session)


def test_calculate_estimate_filament_not_found(db_session):
    uid = uuid.uuid4()
    user = User(id=uid, email="u2@example.com", username="u2", hashed_password="y" * 8)
    model = ModelMetadata(
        id="1",
        filename="m.stl",
        filepath="/tmp/m.stl",
        name="Test",
        description="d",
        uploader=uid,
        volume_mm3=1000,
    )
    db_session.add_all([user, model])
    db_session.commit()
    req = EstimateRequest(
        model_id=1,
        x_mm=10,
        y_mm=10,
        z_mm=10,
        filament_type="unknown",
        filament_colors=["#fff"],
        print_profile="standard",
    )
    with pytest.raises(ValueError):
        calculate_estimate(req, db_session)


def test_calculate_estimate_pricing_not_found(db_session):
    uid = uuid.uuid4()
    user = User(id=uid, email="u3@example.com", username="u3", hashed_password="z" * 8)
    model = ModelMetadata(
        id="1",
        filename="m.stl",
        filepath="/tmp/m.stl",
        name="Test",
        description="d",
        uploader=uid,
        volume_mm3=1000,
    )
    filament = Filament(
        id="fil1",
        name="PLA Test",
        type="PLA",
        color="#fff",
        price_per_kg=20.0,
        is_active=True,
    )
    db_session.add_all([user, model, filament])
    db_session.commit()
    req = EstimateRequest(
        model_id=1,
        x_mm=10,
        y_mm=10,
        z_mm=10,
        filament_type="PLA Test",
        filament_colors=["#fff"],
        print_profile="standard",
    )
    with pytest.raises(ValueError):
        calculate_estimate(req, db_session)
