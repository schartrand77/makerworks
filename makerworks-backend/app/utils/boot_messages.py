"""
Boot messages for MakerWorks backend startup banner.
"""

import random

BOOT_MESSAGES = [
    "📡 Your print is being monitored by NSA for stringing violations.",
    "🕸️ Spiders envy your bridging technique.",
    "💽 Uploading your STL to the cloud… and everyone else's.",
    # … (rest of messages) …
    "🪑 Sitting down on the job — bed leveling.",
]


def random_boot_message() -> str:
    """
    Return a random boot message from the list.
    """
    return random.choice(BOOT_MESSAGES)
