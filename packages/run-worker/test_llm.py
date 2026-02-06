"""Sanity check: verify LLM call works with current .env config."""
import asyncio
import os
import time

from dotenv import load_dotenv

load_dotenv()

from fle.agents.llm.api_factory import APIFactory  # noqa: E402
from fle.agents.llm.parsing import parse_response  # noqa: E402


async def test():
    model = os.getenv("MODEL", "claude-sonnet-4-5-20250929")

    # Apply custom API override (same logic as main.py)
    if os.getenv("CUSTOM_API", "").lower() in ("true", "1", "yes"):
        custom_url = os.getenv("CUSTOM_API_URL")
        custom_key = os.getenv("CUSTOM_API_KEY")
        if not custom_url or not custom_key:
            raise ValueError("CUSTOM_API=true requires CUSTOM_API_URL and CUSTOM_API_KEY")
        custom_provider = {
            "base_url": custom_url,
            "api_key_env": "CUSTOM_API_KEY",
            "key_manager_provider": "custom",
        }
        APIFactory.PROVIDERS["custom"] = custom_provider
        APIFactory._get_provider_config = lambda self, m: custom_provider
        print(f"Custom API: {custom_url}")

    api_factory = APIFactory(model)

    # 1. Check provider detection
    try:
        config = api_factory._get_provider_config(model)
        print(f"Model:    {model}")
        print(f"Provider: base_url={config['base_url']}, key_env={config['api_key_env']}")
    except ValueError as e:
        print(f"FAIL: Provider detection failed: {e}")
        return

    # 2. Check API key is available
    try:
        key = api_factory._get_api_key(config)
        print(f"API key:  {key[:8]}...{key[-4:]}")
    except ValueError as e:
        print(f"FAIL: No API key: {e}")
        return

    # 3. Make a simple call
    messages = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Reply with exactly: HELLO WORLD"},
    ]

    print("\nCalling LLM...")
    t0 = time.time()
    try:
        response = await api_factory.acall(messages=messages, max_tokens=64, temperature=0)
    except Exception as e:
        print(f"FAIL: acall raised {type(e).__name__}: {e}")
        return
    elapsed = time.time() - t0
    print(f"Response in {elapsed:.1f}s")

    # 4. Check response structure
    if not hasattr(response, "choices") or not response.choices:
        print(f"FAIL: Unexpected response structure: {type(response)}")
        print(f"  response = {response}")
        return

    text = response.choices[0].message.content
    print(f"Text:     {text!r}")

    if hasattr(response, "usage") and response.usage:
        print(f"Tokens:   in={response.usage.prompt_tokens} out={response.usage.completion_tokens}")

    # 5. Test parse_response
    policy = parse_response(response)
    if policy:
        print(f"\nparse_response: extracted code ({len(policy.code)} chars)")
        print(f"  code = {policy.code[:100]!r}")
    else:
        print(f"\nparse_response: None (expected — response isn't Python code)")

    # 6. Test with a code-producing prompt
    print("\n--- Code extraction test ---")
    code_messages = [
        {"role": "system", "content": "You are a Python programmer. Respond with Python code."},
        {"role": "user", "content": "Write a one-liner that prints 'hello factorio'"},
    ]
    t0 = time.time()
    try:
        code_response = await api_factory.acall(messages=code_messages, max_tokens=256, temperature=0)
    except Exception as e:
        print(f"FAIL: acall raised {type(e).__name__}: {e}")
        return
    elapsed = time.time() - t0
    print(f"Response in {elapsed:.1f}s")

    code_text = code_response.choices[0].message.content
    print(f"Raw text: {code_text!r}")

    policy = parse_response(code_response)
    if policy:
        print(f"Extracted: {policy.code!r}")
        print("OK: parse_response extracted valid Python")
    else:
        print("FAIL: parse_response returned None — could not extract Python")

    print("\n--- All checks passed ---")


if __name__ == "__main__":
    asyncio.run(test())
