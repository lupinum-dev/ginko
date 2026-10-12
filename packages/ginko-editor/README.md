# @lupinum/ginko-editor

> Internal: this package is not published to npm. It runs only on the Ginko platform that Lupinum hosts.

The editing logic for [Ginko](https://github.com/lupinum-dev/ginko/tree/main/packages/ginko) bricks,
without any UI. The form components (one per field type, built on shadcn-vue) live in the Studio
layer, `@lupinum/ginko-studio`.

## What is in it

| Module | Purpose |
| --- | --- |
| `core/` | The headless Markdown editor: TipTap extensions per profile, Markdown to editor document and back (`toEditorDoc`, `fromEditorDoc`), `createGinkoEditor`, `useGinkoEditor`. Untouched blocks are saved byte for byte. |
| `assets.ts` | `GinkoAssets`, the upload adapter the host provides once (`provideGinkoAssets`, `useGinkoAssets`). |
| `useUpload.ts` | The upload flow image and file fields share: picker, cancel, error, retry, save blocking. |
| `issues.ts` | `BLOCKERS`, `TRANSLATION`, `ownIssues`, `issuesUnder`: server validation issues per field. |
| `values.ts`, `today.ts` | `textIn`, `newRowId`, `parseMoney`, `formatAmount`, `useToday`. |

## License

MIT © Lupinum OG
