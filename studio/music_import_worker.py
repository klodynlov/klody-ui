import json
from pathlib import Path
import sys
from music_files import import_asset

if __name__ == '__main__':
    import_asset(json.loads(Path(sys.argv[1]).read_text()))
