import logging

from tenacity import stop_after_attempt, before_sleep_log

from fle.agents.llm.api_factory import APIFactory
from fle.agents.formatters import RecursiveReportFormatter


def _coerce_messages_to_text_only(messages):
    """Convert structured/multimodal chat content into plain strings."""
    coerced = []
    for msg in messages:
        content = msg.get("content")
        if isinstance(content, list):
            text_parts = []
            for part in content:
                if not isinstance(part, dict):
                    text_parts.append(str(part))
                    continue
                if part.get("type") == "text":
                    text_parts.append(str(part.get("text", "")))
                elif part.get("type") == "image_url":
                    text_parts.append("[Image attached]")
                else:
                    text_parts.append(str(part))
            coerced.append({**msg, "content": "\n".join(p for p in text_parts if p)})
        elif content is None:
            coerced.append({**msg, "content": ""})
        else:
            coerced.append({**msg, "content": str(content)})
    return coerced


def _should_use_text_only_messages(model: str, custom_api_enabled: bool) -> bool:
    """Providers like DeepSeek and some OpenAI-compatible endpoints reject image_url blocks."""
    if custom_api_enabled:
        return True
    return "deepseek" in (model or "").lower()


def build_api_factory(
    model: str,
    force_provider: str | None,
    custom_api_enabled: bool,
    custom_api_url: str | None,
    custom_api_key: str | None,
) -> APIFactory:
    """Register providers, apply patches, and return a ready APIFactory."""
    forced_provider_config = None

    if custom_api_enabled:
        if not custom_api_url or not custom_api_key:
            raise ValueError("CUSTOM_API=true requires CUSTOM_API_URL and CUSTOM_API_KEY")
        APIFactory.PROVIDERS["custom"] = {
            "base_url": custom_api_url,
            "api_key_env": "CUSTOM_API_KEY",
            "key_manager_provider": "custom",
        }

    # Register "gpt" prefix so gpt-* models route to the openai provider
    if "gpt" not in APIFactory.PROVIDERS:
        APIFactory.PROVIDERS["gpt"] = APIFactory.PROVIDERS["openai"]

    if force_provider == "custom":
        forced_provider_config = APIFactory.PROVIDERS.get("custom")
    elif force_provider == "anthropic":
        forced_provider_config = APIFactory.PROVIDERS.get("claude")
    elif force_provider == "openai":
        forced_provider_config = APIFactory.PROVIDERS.get("openai")
    elif force_provider:
        print(f"Warning: unknown FORCE_LLM_PROVIDER={force_provider!r}; falling back to model-based detection")

    if force_provider and not forced_provider_config:
        raise ValueError(f"FORCE_LLM_PROVIDER={force_provider} could not be resolved")
    if forced_provider_config:
        print(
            f"Forcing LLM provider to '{force_provider}' "
            f"(base_url={forced_provider_config.get('base_url')})"
        )
        APIFactory._get_provider_config = lambda self, m, cfg=forced_provider_config: cfg

    api_factory = APIFactory(model)

    # Limit retries to 3 and log errors instead of silent infinite retry
    api_factory.acall.retry.stop = stop_after_attempt(3)
    api_factory.acall.retry.before_sleep = before_sleep_log(
        logging.getLogger("acall"), logging.WARNING
    )

    return api_factory


def build_formatter(api_factory: APIFactory) -> RecursiveReportFormatter:
    return RecursiveReportFormatter(
        chunk_size=16,
        llm_call=api_factory.acall,
    )
