---
name: ginko
description: Use when you maintain a website's content through a Ginko agent key (MCP tools ginko_overview, ginko_read, ginko_search, task_*, and for owners and admins ginko_schema, ginko_write, ginko_create, ginko_import, ginko_upload). Covers reading before writing, filling a site, quoting facts, proposals that wait for approval, translations, files, link checks and undo.
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
- Nothing goes online on its own: a new entry is a draft, and a change to a published entry or a single brick waits as
  an unpublished change. The person publishes it in the platform.
- When the person asks for a change to go online now ("Setz heute ausgebucht"), add `publish: true` to the task,
  `ginko_write`, `ginko_create`, `ginko_translate` or `ginko_import` item. Never add it on your own.
- A published change is online in about a minute. The answer names a `change` ID.
  Take it back with `ginko_undo({ change })`.
- Give each change a `request_id` of your own (letters, digits, `_` and `-`). When an answer gets lost, send the same call
  with the same `request_id` again: the change runs only once, and you get the first answer.
- `ginko_draft({ brick, fields })` makes a draft in a collection. A draft is not on the website.
  The person publishes it in the platform.

## Build and fill the site (owners and admins)

Owners and admins see five more tools. They write any field, as the Studio does, without a task.

- `ginko_schema({ brick? })` shows every field as JSON Schema, in the form the tools below take. Read it first.
- `ginko_write({ brick, entry?, fields })` changes fields in the main language. Leave out `entry` for a single brick.
  A list replaces the whole list; `null` removes an optional value.
- `ginko_create({ brick, fields, publish? })` makes an entry in a collection. The address comes from the title.
- `ginko_import({ items, dry_run? })` writes up to 50 items in one step, all or nothing. Run it with `dry_run: true`
  first: it checks every item with the real save and saves nothing. An error names the item (`items[3]: …`).
- A wrong field or brick name gets a "Did you mean …?" answer. Use the suggested key.
- Answers carry a `studio` link to the entry, so you can show the person where to look.

## Facts (values that appear in many texts)

- `ginko_overview` may list `facts`: values the site keeps in one place, such as a price, the opening days or the phone
  number. Each has a `quote`, a `label`, what the website `shows` today and, when a change is planned, `next`.
- In a Markdown text, write the quote where the value belongs, for example
  `Eine Sitzung kostet :fact{name="practice.price"}.` The page shows the value in effect today, and the text stays
  right when the value changes. Do not type the value itself.
- To change a value, change its own field (a task or `ginko_write` on its brick), never the texts that quote it.
- When an answer says that a text copies a fact value, write it again with the quote.

## Proposals ("show me first")

- Add `propose: true` to any write tool, and the change is not made. It becomes a proposal the person approves.
  Use it when you are unsure, for big changes, or when the person says "show me first".
- If review is on for your key, every write becomes a proposal without `propose`. `ginko_undo` then refuses on live content: propose the earlier version with `ginko_revert`.
- The answer "Proposed, waiting for approval." means: nothing is live yet, and there is nothing to undo.
  Say exactly this to the person. Do not say the change was made.
- `ginko_proposals` lists your own proposals and their state: waiting, applied, rejected (with the reason) or outdated.
  Check it when the person asks what is still open. After a rejection or an outdated state, propose again.

## Translations

- `ginko_translate({ entry, locale, fields })` writes the text in a foreign language, for example `{ "name": "Veal schnitzel" }`.
  It never changes the main language and refuses it.
- `ginko_read` in a foreign language marks missing texts in `fallback` (the website shows the main language there) and
  outdated ones in `stale`. An outdated translation was written for an older main text, and the website still shows it.
  Translate it again, or list it in `confirm` if it is still right.
- Translate whole texts, keep the tone and the format (Markdown stays Markdown).

## Files

- You can use files that already exist (images and PDFs have an ID).
- Owners and admins add files with `ginko_upload`: `{ url }` fetches a public https address; without `url` the answer
  is a one-time upload address and a `curl` command for a file on your computer. Use the ID in an image field
  (`{ "file": ID, "alt": "…" }`) or in Markdown as `![Description]($file.<ID>)`.
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

- Publish drafts or unpublished changes that already wait (only your own call with `publish: true` goes online), take
  entries offline, restore removed entries, change the structure of the
  site (bricks and fields come from the site's code), manage people or keys. Staff keys cannot upload files.
- Use a tool you do not see: the person does not hold that right.
- More than 60 calls a minute. Wait a minute when you hit the limit.

When you are done, tell the person in short words what changed, what is waiting for approval, and what they can still do themselves.
