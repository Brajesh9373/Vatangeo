"""Patch app.py to handle nemotron XML-style tool calls."""
import pathlib
import re

p = pathlib.Path("app.py")
c = p.read_text("utf-8")

# 1. Add imports
if "import re\n" not in c:
    c = c.replace("import os\n", "import os\nimport re\n")
if "from typing import Any" not in c:
    c = c.replace("from typing import AsyncGenerator", "from typing import Any, AsyncGenerator")

# 2. Add XML parser before _stream_chat
parser = """
_XML_TOOL_RE = re.compile(r"<function=(\\S+)>(.*?)</function>", re.DOTALL)
_XML_PARAM_RE = re.compile(r"<parameter=(\\w+)>\\s*(.*?)\\s*