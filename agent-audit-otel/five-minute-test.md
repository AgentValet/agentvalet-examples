# The five-minute test

Pick one tool call an agent made yesterday. Using logs alone, and within five minutes, name six things:

| # | Field | The question | "None" is a valid answer when |
| --- | --- | --- | --- |
| 1 | **Agent** | Which agent identity made the call? | never |
| 2 | **User** | On whose behalf? | the agent acted for nobody (an autonomous agent) |
| 3 | **Tool** | Which server and tool, with what arguments? | never |
| 4 | **Decision** | Which policy allowed it, or refused it? | never |
| 5 | **Approver** | Who approved it? | the call did not need approval |
| 6 | **Result** | What came back, or the error? | never |

"None" only counts when the log says so. A blank field is a miss.

## The metric: attributable actions

1. Sample 20 tool calls at random from the last day or week. Not the ones you know are clean.
2. Start a timer for each. Stop at five minutes.
3. A call scores 1 only if you named all six fields from logs. Partial answers score 0.
4. **Attributable actions** = calls scored 1 ÷ 20, as a percentage.
5. Record the field you missed most often. That field is the fix.

Run it monthly, and after any change to the gateway, the identity provider or the log pipeline.

## Scoring sheet

Copy [scoring-sheet.csv](scoring-sheet.csv) into a spreadsheet, or fill in this table.

| Call | When | Agent | User | Tool + args | Decision | Approver | Result | Minutes | Score (0/1) | Missed field |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | | | | | |
| 2 | | | | | | | | | | |
| … | | | | | | | | | | |
| 20 | | | | | | | | | | |

**Attributable actions:** \_\_ / 20 = \_\_ %  ·  **Most-missed field:** \_\_\_\_  ·  **Run by / date:** \_\_\_\_

## With this kit

The lab answers the question for you, so you can see what a passing record looks like before you score your own:

```bash
cd oss
docker compose exec -T audit-reader cat /audit/access-log.jsonl | node ../queries/answer.mjs
```

```text
2026-11-02T23:02:33.641Z  trace 362c145ba5147ee705bfea585389de46
  agent     support-bot
  user      alice@example.com
  tool      echo
  arguments {"message":"refund order 1042"}
  decision  allowed by agent-tools-v1
  approver  apr-7731
  result    {"content":[{"type":"text","text":"Echo: refund order 1042"}]}
  score     6/6
```

That record is from the kit's own self-test. A call the policy refused shows `decision  denied by agent-tools-v1` and the refusal as its result.
