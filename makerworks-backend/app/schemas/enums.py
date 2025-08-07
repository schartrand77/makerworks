# app/schemas/enums.py

from enum import Enum


class CurrencyEnum(str, Enum):
    USD = "usd"
    CAD = "cad"
    EUR = "eur"

    def __str__(self):
        return self.description()

    def description(self) -> str:
        return {
            "usd": "US Dollars ($)",
            "cad": "Canadian Dollars (CA$)",
            "eur": "Euros (€)",
        }.get(self.value, self.value.upper())

    @classmethod
    def openapi_schema(cls):
        """Returns an OpenAPI-compatible enum description override."""
        return {
            "type": "string",
            "enum": [e.value for e in cls],
            "description": "Currency used for checkout",
            "examples": [e.description() for e in cls],
        }
