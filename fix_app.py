"""One-shot patch: add XML tool call parsing to app.py for nemotron models."""
import pathlib

p = pathlib.Path("app.py")
code = p.read_text(encoding="utf-8")

# 1. Add re import
if "import re\n" not in code:
    code = code.replace("import os\n", "import os\nimport re\n")

# 2. Add typing import
if "from typing import Any" not in code:
    code = code.replace(
        "from typing import AsyncGenerator",
        "from typing import Any, AsyncGenerator",
    )

# 3. Add XML parser before _stream_chat
XML_BLOCK = r'''
_XML_TOOL_RE = re.compile(
    r"<tool_call>\s*<function=(\S+)>(.*?)</function>\s*</tool_call>", re.DOTALL
)
_XML_PARAM_RE = re.compile(
    r"<parameter=(\w+)>\s*(.*?)\s*