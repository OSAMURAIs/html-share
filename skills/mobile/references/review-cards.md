# Review card format

Use a JSON array. Each card accepts these fields:

| Field | Required | Limit | Purpose |
|---|---:|---:|---|
| `title` | yes | 160 | Identify the task on a phone |
| `question` | yes | 1,000 | State the decision in one sentence |
| `context` | no | 3,000 | Give only the facts needed to decide |
| `recommendation` | no | 1,000 | State the agent's recommended action |

Do not include code, logs, credentials, signed URLs, or long histories. Put detail in the status HTML.

The first card should always summarize the task. Add more cards only when the answers can differ independently.
