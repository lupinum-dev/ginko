---
name: ginko
description: Use when you maintain a website's content through a Ginko agent key (MCP tools ginko_overview, ginko_read, ginko_search, task_*). Covers reading before writing, proposals that wait for approval, translations, files, link checks and undo.
---

# Working with a Ginko website

Ginko holds the content of one website for one person (often a restaurant owner or a small team).
You act as that person, with exactly their rights. You see only the tools they may use.
You cannot do more than they can, and everything you change is shown in their history as made through AI, with the name of your key.

## Start

1. Call `ginko_overview`. It names the site, the languages, the bricks (content areas) and the tasks you may run.
2. If it says `review: true` (or has a `hint`), your changes wait for approval. Tell the person this at the start.
3. Talk to the person in their language. Tool descriptions, answers and error messages are in English; pass them on in plain words. Texts of the website itself stay in the language of the website.

## Read before you write

- `ginko_read({ brick, locale? })` shows the published content, with the entry IDs.
  Drafts are not in it.
- `ginko_search({ query })` finds entries by words in their texts (also drafts). Umlauts do not matter.
- Never guess an entry ID. Take it from `ginko_read` or `ginko_search`.
- `ginko_history` lists the latest changes. `ginko_version_at({ entry, change })` shows an older state.

## Change things

- Prefer the task tools (`task_<brick>_<id>`). One task is one clear job, for example "Heute ausgebucht".
  Name only the fields you want to change. Other fields stay.
- Texts go in the main language as plain text. Money goes in whole currency units (19.90).
- Removing needs `confirm: true`. Ask the person first.
- A change is online in about a minute. The answer names a `change` ID.
  Take it back with `ginko_undo({ change })`.
- `ginko_draft({ brick, fields })` makes a draft in bricks that have drafts. A draft is not on the website.
  The person publishes it in the platform. You cannot publish.

## Proposals ("show me first")

- Add `propose: true` to any write tool, and the change is not made. It becomes a proposal the person approves.
  Use it when you are unsure, for big changes, or when the person says "show me first".
- If review is on for your key, every write becomes a proposal without `propose`.
- The answer "Proposed, waiting for approval." means: nothing is live yet, and there is nothing to undo.
  Say exactly this to the person. Do not say the change was made.
- `ginko_proposals` lists your own proposals and their state: waiting, applied, rejected (with the reason) or outdated.
  Check it when the person asks what is still open. After a rejection or an outdated state, propose again.

## Translations

- `ginko_translate({ entry, locale, fields })` writes the text in a foreign language, for example `{ "name": "Veal schnitzel" }`.
  It never changes the main language and refuses it.
- `ginko_read` in a foreign language marks texts in `fallback` (missing or outdated) and, for outdated ones, in `stale`.
  An outdated translation was written for an older main text. Translate it again, or list it in `confirm` if it is still right.
- Translate whole texts, keep the tone and the format (Markdown stays Markdown).

## Files

- You can use files that already exist (images and PDFs have an ID). You cannot upload new ones.
- `ginko_file_usage({ file })` shows where a file is used and whether an image lacks its description.

## Links

- `ginko_check_links` lists broken internal links and unsafe links, with entry, field and reason.
  Links to files in the website's public folder are reported as unknown, because Ginko cannot see that folder.
- Report them and fix only what the person asks you to fix.

## Go back

- `ginko_undo({ change })` takes back one change.
- `ginko_revert({ entry, change })` sets an entry to the state after an older change. Look at `ginko_version_at` first.
  Both are normal changes and can wait for approval like any other.

## What you cannot do

- Publish or unpublish drafts, restore removed entries, upload files, change the structure of the site, manage people or keys.
- Use a tool you do not see: the person does not hold that right.
- More than 60 calls a minute. Wait a minute when you hit the limit.

When you are done, tell the person in short words what changed, what is waiting for approval, and what they can still do themselves.
