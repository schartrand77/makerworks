# Future API Guidelines

The MakerWorks backend is powered by FastAPI, Celery and PostgreSQL. To keep the project easy to maintain and extend for future releases, consider the following best practices when adding new endpoints or features.

## Versioning Strategy
- Stick to semantic versioning for the entire API (`v1`, `v2`, etc.).
- Deprecate old endpoints only after a stable replacement exists.

## Consistent Schemas
- Pydantic models live under `app/schemas/`. Reuse existing fields when possible.
- Document each field with examples and descriptions. Validation errors should be clear.

## Database Migrations
- Use Alembic for migrations. Create a descriptive migration file and update `alembic/versions/`.
- Avoid destructive schema changes in minor releases.

## Background Jobs
- Heavy tasks should run via Celery. Add them under `app/tasks/` and document the expected inputs and outputs.

## Security
- Authentication relies on JWTs in `app/core/jwt.py`. Keep token scopes narrow and validate payloads carefully.
- Sanitize all file uploads. See `app/routes/upload.py` for reference.

## Documentation
- Update `README.md` whenever a new feature or environment variable is introduced.
- Provide an example request/response for each new route in the Postman collection.

## Testing
- All new endpoints require unit or integration tests in `tests/`.
- `pytest` and `pytest-asyncio` are already configured—make sure tests run with `pytest -q`.

## Monitoring
- New metrics should be exposed via `prometheus_client` and added to `prometheus.yml`.

Following these guidelines will help the MakerWorks API stay maintainable and ready for future expansion.
