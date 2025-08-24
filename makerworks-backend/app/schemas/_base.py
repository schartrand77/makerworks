from pydantic import BaseModel, ConfigDict

class APIModel(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,   # replaces orm_mode=True
        populate_by_name=True,  # handy for aliased fields
    )
