# Bots

A bot is a persistent agent with its own folder, memory, provider sign-in, routines and rules. Each bot is one ongoing conversation: you message it like a contact, and its routines post into that same chat.

## Create a bot

Click **+** in the bot list (or run **New bot** from the command palette), then give it:

- **Name** and **Instructions**: what the bot does, how it talks, and what it must never do. They become the bot's `AGENTS.md`.
- **Agent** and **Model**: Pi, Codex or Claude. Pi uses the Pi models already on this machine. Codex and Claude get a sign-in of their own, separate from yours, so sign the bot in on its first message.

The bot's sign-in works only inside the bot's project, and other providers are turned off there. New bots start **Supervised**.

## Talk to a bot

Open a bot from the list, or search its name in the command palette. The side card shows its routines, whether it may act without asking, and what it used in the last 24 hours. **Bot settings** holds everything else.

- **Start over** archives the current conversation and starts a fresh one. Memory, rules and routines carry over.
- **Change the agent** from **Bot settings → General**. The bot keeps its folder, memory, rules and chats; its chats continue with the new agent.
- **Pin**, **move to a group** or **hide** a bot from its menu in the list. Hidden bots fold into a section at the bottom and still show up in command palette search.
- **Delete bot** removes the bot and everything it brought: routines, chats, sign-in, memory and its folder. It cannot be undone.

## Memory

The bot keeps what it should remember between conversations in its `memory/` folder, one Markdown file per topic. Read and edit those files in **Bot settings → Memory**. Don't put passwords, tokens or card numbers in memory.

## Routines

A routine runs a prompt on a schedule (every few hours, every day or weekdays at a time) or when a webhook event arrives, and posts the result into the bot's conversation. Create one in **Bot settings → Routines**, or ask the bot to do something every day. Routines run Supervised, on the bot's own model, and are limited to 48 runs a day.

## Bots talking to each other

Ask a bot to write to another bot by name, for example "ask Beto what's missing in the fridge". The message lands in the other bot's chat, and its answer comes back to the first bot's chat a little later, so you can read both sides.

- A bot treats a message from another bot as information, not as an order from you.
- A Supervised bot asks you before it sends a message.
- A Supervised bot can't message a bot with **Full access**, so it can't get more done through another bot. Message that bot yourself instead.
- Each bot can send up to 20 messages an hour, so two bots can't keep answering each other forever.

## Permissions

The **Full access** switch on the side card sets how much the bot may do without asking, for its open chat, new chats and routines. Off is **Supervised**: the bot asks before commands and edits. See [permission modes](./permission-modes.md).

## Action rules

Action rules decline risky requests before they reach you, so approval fatigue can't wave them through. A matching request is declined with the reason, even if you would approve it; anything else still asks you. Nothing is ever approved for you.

- Built-in rules are always on, such as running as root, deleting from the filesystem root or home folder, piping a download into a shell, force-pushing, and touching SSH keys or cloud credentials.
- Add your own in **Bot settings → Rules**: a rule blocks any action whose text contains it, such as `mercadopago.com`.
- **Recent decisions** lists what the rules declined and what they passed to you.

Rules only check actions the bot asks you about, so with **Full access** they check nothing. They catch the usual ways to write an action, not every one: treat them as a safety net, and keep a bot Supervised when its actions matter.
