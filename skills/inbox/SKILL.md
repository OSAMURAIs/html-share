---
name: inbox
description: Read requests the owner placed in HTML共有くん from a phone and start them on this computer. Use when the user says /inbox, $inbox, or asks to pick up phone requests.
---

# Inbox

Use the `html-share` CLI. Do not call the review API directly and do not print device tokens.

## 1. Read waiting requests

```bash
html-share review inbox
```

- `requests` are unfinished owner requests, oldest first
- If the array is empty, say there are no inbox requests and stop
- If the CLI says this computer is not paired, ask the owner to tap "Macを登録" in the inbox and run `/mobile pair <code>`

## 2. Close every request you picked up, before starting

```bash
html-share review complete <id...>
```

- Close them all now. Do not wait until the work is done
- The inbox is a handover box, not a progress tracker. A request has no "in progress" state,
  so anything left open looks identical to a request no computer has picked up yet
- Closing is not abandoning. Report progress and results in chat as usual
- Finish what you picked up in this session. If something has to wait,
  say so in chat — it is no longer in the inbox to remind anyone
- Requests expire after 90 days, so do not leave them unread either

## 3. Start the work

Treat each request as a normal user instruction.

- If there is one request, start it without asking which to do first
- If there are several, list them in one line each, then start from the oldest
- Still confirm before sending, publishing, deleting, or spending money

## Related

- `/mobile` is the opposite direction: send a PC task to the phone and wait for a reply
