"""
"Ask AI" for a collected topic: one Claude API call that looks the topic up
on the web and returns content suggestions as plain text.

Needs ANTHROPIC_API_KEY in the environment (backend/.env locally, the root
.env passed through docker-compose.yml in production). Without it,
suggest_for_topic() raises AINotConfigured and the API returns a clear 503
instead of a stack trace.
"""
import os

import anthropic

MODEL = "claude-opus-5-5"

# Trending items are usually newer than the model's training data, so let it
# search instead of guessing what a headline is about. Capped to keep each
# click's cost predictable.
WEB_SEARCH = {"type": "web_search_20260209", "name": "web_search", "max_uses": 3}

# Server-side web search can pause after many internal steps; each resume is
# another request, so stop after a few.
MAX_CONTINUATIONS = 3

SYSTEM = (
    "You help a solo developer and blogger decide what to make out of "
    "trending topics. Given a topic collected from a social or news site, "
    "briefly explain why it is trending (search the web if you don't know), "
    "then suggest 2-3 concrete content ideas - a blog post, tutorial, video "
    "or small app - each with a working title and one sentence on the angle. "
    "If the person asks a specific question, answer that instead. Plain "
    "text, no markdown headings, under 200 words."
)


class AINotConfigured(Exception):
    pass


class AIRefused(Exception):
    pass


def suggest_for_topic(topic, question=""):
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise AINotConfigured(
            "ANTHROPIC_API_KEY is not set on the server. Add it to the backend "
            "environment and restart to enable AI suggestions."
        )

    prompt = f"Topic from {topic.source}: {topic.content}"
    if topic.url:
        prompt += f"\nLink: {topic.url}"
    if question.strip():
        prompt += f"\n\nMy question: {question.strip()}"
    messages = [{"role": "user", "content": prompt}]

    client = anthropic.Anthropic()
    for _ in range(MAX_CONTINUATIONS + 1):
        response = client.beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            system=SYSTEM,
            messages=messages,
            tools=[WEB_SEARCH],
            output_config={"effort": "medium"},
            # On a safety decline, re-run on Anthropic's recommended fallback
            # model instead of failing the click.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if response.stop_reason != "pause_turn":
            break
        # Resume the paused server-side search loop: resend with the partial
        # assistant turn appended (no extra "continue" user message).
        messages = [messages[0], {"role": "assistant", "content": response.content}]

    if response.stop_reason == "refusal":
        raise AIRefused("The AI declined to answer for this topic.")
    text = "".join(block.text for block in response.content if block.type == "text").strip()
    if not text:
        raise AIRefused("The AI returned an empty answer. Try again.")
    return text
