# Notes before release

- **Sample content.** The writers Ida Wren and Tom Marsh, their city, the river, the tram line and the coast are
  invented; the nature facts in the posts (swifts, beech leaves in winter, rock pool life, tawny owl calls, street
  trees in winter) were written to be true but not checked by a naturalist. `content/site.md` has a sample email
  (`example.com`), and the legal texts are marked placeholders.
- **Photos.** The three photos are stock photos (MEDIA.md); four of the seven posts have none on purpose, to show the
  no-image state.
- **Scheduled post and draft.** `owls-in-the-old-cemetery` is dated 2027-01-17 and `lichen-on-the-old-bridge` has
  `draft: true`; both must stay off the site (gate 3, `templates/_features/blog/e2e/blog.spec.ts`). create-ginko does
  not move post dates (posts have no `visible` rule), so in a copy made after 17 January 2027 the owls post is an
  ordinary published post. Move its date with the monthly re-anchor if the sample should keep a scheduled post.
- **German** says "du" on every page (a personal blog), also in the placeholders of `content/legal/`.
- **Studio (gate 7).** No `templates/_studio/blog` yet. In the Studio a post is scheduled with the publish step
  (`publishAt`); `local:files-export` imports a future-dated file post as a published entry, so the export should turn
  it into a scheduled draft before the platform variant is tested.
