"""LLM tool registry: argument validation, dispatch, and prompt.

`resolve_tool(fn_name, fn_args)` is the single point where LLM-supplied
function-call arguments become graph queries. Each tool's arguments are
validated through a Pydantic model with custom coercers that strip the
junk strings the LLM sometimes echoes back (e.g. `form_factor="user_input"`).
Validation failures return `{"error": ...}` rather than raising, so the
chat stream can surface the failure to the LLM as a normal tool result.

The system prompt and tool schema (`TOOL_DEFINITIONS`) are the contract
between the backend and the LLM. Keep `KNOWN_MODELS` in sync with
`MODEL_MAP` in `graph_queries.py` — if you add a product there, add it here.
"""
import logging
from typing import Any

from pydantic import BaseModel, Field, field_validator

from .graph_queries import (
    tool_compare,
    tool_find_by_requirement,
    tool_get_spec,
    tool_list_models,
)

LOG = logging.getLogger('vantageo.tools')

# Canonical model names. The LLM is told these are the only valid inputs to
# get_product_spec. Add new products here when they land in json_formate/.
KNOWN_MODELS: list[str] = [
    '1240-RG', '2240', '2240-RG', '2240-RM', '2240-RE',
]

SYSTEM_PROMPT: str = f"""You are a Vantageo product configuration assistant. You help customers choose and configure Vantageo enterprise servers.

RULES:
1. ONLY answer based on data returned by the function tools — never invent specs.
2. If a tool returns empty or error results, tell the user honestly and suggest trying different criteria.
3. Tool results for get_product_spec, list_products, and find_by_requirement are NOT shown to the user as a card — you must include the relevant data directly in your reply. Format with clear section headers and bullet points (e.g. "**Form Factor**: 1U Rack Server", "**Memory**: 8 DIMM slots, DDR5"). Be complete: cover processor, memory, storage, expansion, networking, management, and any other field the user is likely to care about.
4. Tool results for compare_products ARE shown in a side-by-side table. After the table, add 1-2 sentences highlighting the key tradeoffs — do not repeat the table in prose.
5. Model names: {', '.join(KNOWN_MODELS)}.
6. When a user wants a quote or pricing, call generate_quote. It opens an inline form in the chat pre-filled with the configuration you extract from the conversation; the user then fills their name/company/email and submits to receive a formatted receipt. Do NOT compute prices yourself — the tool does that.
7. When a user says they need help finding a server but hasn't specified requirements yet, ask them about their needs (form factor, DIMM slots, sockets, storage bays, use case) before calling any tool. Do not call find_by_requirement with empty parameters.
8. After gathering the user's requirements, call the appropriate tool to find matching products.
9. When calling generate_quote, extract numeric values from the user's message where possible: memory_gb in GB (e.g. "256GB" → 256), storage_gb in GB (e.g. "4TB" → 4000), gpu_count as integer. Pass 0 for any field the user hasn't mentioned — the system will apply sensible defaults.
"""


# ---------- Argument coercion helpers ----------

# Strings the LLM sometimes echoes when it has no real value for a parameter.
# Treat them as empty so they don't poison Cypher queries or confuse users.
_JUNK_STRINGS = {'', 'user_input', 'none', 'null', 'undefined', 'unknown', 'n/a'}


def _clean_str(v: Any) -> str:
    if v is None:
        return ''
    s = str(v).strip()
    return '' if s.lower() in _JUNK_STRINGS else s


def _clean_int(v: Any) -> int:
    if v is None or v == '':
        return 0
    try:
        n = int(v)
    except (ValueError, TypeError):
        return 0
    return max(0, n)


# ---------- Pydantic models for tool arguments ----------

class GetProductSpecArgs(BaseModel):
    model: str = ''

    @field_validator('model', mode='before')
    @classmethod
    def _coerce(cls, v: Any) -> str:
        return _clean_str(v)


class FindByRequirementArgs(BaseModel):
    form_factor: str = ''
    min_dimm: int = 0
    sockets: int = 0
    min_storage_bays: int = 0
    use_case: str = ''

    @field_validator('form_factor', 'use_case', mode='before')
    @classmethod
    def _coerce_str(cls, v: Any) -> str:
        return _clean_str(v)

    @field_validator('min_dimm', 'sockets', 'min_storage_bays', mode='before')
    @classmethod
    def _coerce_int(cls, v: Any) -> int:
        return _clean_int(v)


class CompareProductsArgs(BaseModel):
    products: list[str] = Field(default_factory=list)

    @field_validator('products', mode='before')
    @classmethod
    def _coerce_list(cls, v: Any) -> list[str]:
        if v is None:
            return []
        if isinstance(v, str):
            v = [v]
        if isinstance(v, list):
            return [str(x).strip() for x in v if x is not None and str(x).strip()]
        return []


class GenerateQuoteArgs(BaseModel):
    """LLM-supplied defaults for the quote form. The form will be pre-filled
    with these values; the user adjusts and submits to receive the receipt.
    The tool itself does NOT return a receipt — it signals to the frontend
    that the quote form should open."""
    model: str = ''
    quantity: int = 1
    memory_gb: int = 0
    storage_gb: int = 0
    gpu_count: int = 0
    use_case: str = ''

    @field_validator('model', 'use_case', mode='before')
    @classmethod
    def _coerce_str(cls, v: Any) -> str:
        return _clean_str(v)

    @field_validator('quantity', 'memory_gb', 'storage_gb', 'gpu_count', mode='before')
    @classmethod
    def _coerce_int(cls, v: Any) -> int:
        return _clean_int(v)


# ---------- OpenAI-compatible tool schema ----------

_TOOL_MODEL_LIST = ', '.join(KNOWN_MODELS)

TOOL_DEFINITIONS: list[dict] = [
    {
        'type': 'function',
        'function': {
            'name': 'list_products',
            'description': 'List all Vantageo product models with basic specs (form factor, memory, processor).',
            'parameters': {'type': 'object', 'properties': {}, 'required': []},
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'get_product_spec',
            'description': 'Get the full specification for a specific Vantageo product model.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'model': {
                        'type': 'string',
                        'description': f"Model name. Canonical: {_TOOL_MODEL_LIST}.",
                    },
                },
                'required': ['model'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'find_by_requirement',
            'description': (
                'Find products matching hardware requirements. Use when the user has '
                'specified concrete requirements like form factor, DIMM count, socket '
                'count, storage bays, or use case. Filters are AND-combined; omit '
                'unknown fields.'
            ),
            'parameters': {
                'type': 'object',
                'properties': {
                    'form_factor': {
                        'type': 'string',
                        'description': "Form factor substring, e.g. '2U', '1U'. Omit if unknown.",
                    },
                    'min_dimm': {
                        'type': 'integer',
                        'minimum': 1,
                        'description': 'Minimum DIMM slot count. Omit if unknown.',
                    },
                    'sockets': {
                        'type': 'integer',
                        'minimum': 1,
                        'description': 'Minimum number of CPU sockets (1=single, 2=dual). Omit if unknown.',
                    },
                    'min_storage_bays': {
                        'type': 'integer',
                        'minimum': 1,
                        'description': 'Minimum number of storage drive bays. Omit if unknown.',
                    },
                    'use_case': {
                        'type': 'string',
                        'description': "Substring match against target use cases, e.g. 'AI', 'database', 'edge', 'storage', 'HPC'. Omit if unknown.",
                    },
                },
                'required': [],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'compare_products',
            'description': 'Compare specification of two or more products side-by-side.',
            'parameters': {
                'type': 'object',
                'properties': {
                    'products': {
                        'type': 'array',
                        'items': {'type': 'string'},
                        'description': 'List of model names to compare',
                    },
                },
                'required': ['products'],
            },
        },
    },
    {
        'type': 'function',
        'function': {
            'name': 'generate_quote',
            'description': (
                "Open the quote form pre-filled with the user's configuration. "
                "Use when the user wants pricing, an order quote, or to proceed "
                "with a specific model. Extract numeric values from the user's "
                "message where possible (memory_gb in GB, storage_gb in GB, "
                "gpu_count as integer). Pass 0 for unknown values; the system "
                "applies defaults. The actual receipt is generated by the "
                "frontend when the user submits the form."
            ),
            'parameters': {
                'type': 'object',
                'properties': {
                    'model': {
                        'type': 'string',
                        'description': f"Model name. Canonical: {_TOOL_MODEL_LIST}.",
                    },
                    'quantity': {
                        'type': 'integer',
                        'minimum': 1,
                        'description': 'Number of units. Default 1.',
                    },
                    'memory_gb': {
                        'type': 'integer',
                        'minimum': 0,
                        'description': 'Requested memory in GB. 0 = use model default.',
                    },
                    'storage_gb': {
                        'type': 'integer',
                        'minimum': 0,
                        'description': 'Requested storage in GB. 0 = use model default.',
                    },
                    'gpu_count': {
                        'type': 'integer',
                        'minimum': 0,
                        'description': 'Requested number of GPUs. 0 = none.',
                    },
                    'use_case': {
                        'type': 'string',
                        'description': 'Free-text use case (e.g. "AI inference", "database").',
                    },
                },
                'required': ['model'],
            },
        },
    },
]


# ---------- Dispatch ----------

def resolve_tool(fn_name: str, fn_args: dict) -> dict:
    """Validate `fn_args` against the tool's Pydantic model and dispatch
    to the corresponding graph query. Validation errors and unknown tool
    names return `{"error": "..."}` so the LLM can react to the failure
    rather than the stream blowing up."""
    if fn_name == 'list_products':
        return tool_list_models()
    if fn_name == 'get_product_spec':
        try:
            args = GetProductSpecArgs.model_validate(fn_args)
        except Exception as e:
            return {'error': f'Invalid arguments for get_product_spec: {e}'}
        return tool_get_spec(args.model)
    if fn_name == 'find_by_requirement':
        try:
            args = FindByRequirementArgs.model_validate(fn_args)
        except Exception as e:
            return {'error': f'Invalid arguments for find_by_requirement: {e}'}
        return tool_find_by_requirement(**args.model_dump())
    if fn_name == 'compare_products':
        try:
            args = CompareProductsArgs.model_validate(fn_args)
        except Exception as e:
            return {'error': f'Invalid arguments for compare_products: {e}'}
        if not args.products:
            return {'error': 'compare_products requires at least one product.'}
        return tool_compare(args.products)
    if fn_name == 'generate_quote':
        try:
            args = GenerateQuoteArgs.model_validate(fn_args)
        except Exception as e:
            return {'error': f'Invalid arguments for generate_quote: {e}'}
        if not args.model:
            return {'error': 'generate_quote requires a model name.'}
        return {
            'status': 'form_opened',
            'defaults': {
                'model': args.model,
                'quantity': args.quantity,
                'memory_gb': args.memory_gb,
                'storage_gb': args.storage_gb,
                'gpu_count': args.gpu_count,
                'use_case': args.use_case,
            },
        }
    return {'error': f'Unknown tool: {fn_name}'}
