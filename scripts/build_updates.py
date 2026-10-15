"""Collect current monitoring independently of the research bundle."""
import os
from pathlib import Path
from finscope.updates import collect_updates

if __name__ == '__main__':
    feed = collect_updates(Path('web/data/updates.json'), os.environ.get('SEC_USER_AGENT'),
                           evidence_dir=Path('local-data/updates'))
    print(f"Captured {sum(len(c['filings']) for c in feed['companies'])} filing links and "
          f"{len(feed['treasury']['observations'])} daily rate observations at {feed['captured_at']}")
    print(f"Feed SHA-256: {feed['feed_sha256']}")
