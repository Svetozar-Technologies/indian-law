Fixes #33.

## Summary

- Added a recursive Links Notation law taxonomy in `data/law-categories.lino`.
- Classified every law into exactly one top-level main category and optional secondary `categoryTags`.
- Updated the generated real Pages catalog in `docs/data/catalog.lino` with 846 laws, 58 taxonomy nodes, and 13 collapsible main groups.
- Rebuilt the committed Pages app assets so the category UI and tag badges render from the real catalog.
- Documented the related `satyavera-app` findings and preserved pre/post verification evidence under `docs/case-studies/issue-33/`.

## Reproduction

Before this follow-up, the committed Pages catalog had the real 846-law corpus but no category metadata, and the committed app bundle did not contain the category UI. The reproducing check is saved in:

```sh
docs/case-studies/issue-33/pre-fix-real-pages-tests.log
```

That test failed because `docs/data/catalog.lino` had no `criminal` or `intellectual-property` category, and `docs/assets/app.js` did not contain the category-list UI.

## Verification

```sh
node --test tests/categories.test.mjs tests/generated-pages.test.mjs tests/catalog-status.test.mjs tests/build-site.test.mjs
npm test
npm run build:offline -- --output /tmp/indian-law-issue-33-site-rerun
```

Results:

- Focused tests: 24 passed.
- Full test suite: 52 passed.
- Real committed catalog: 846 laws, 58 taxonomy nodes, 13 top-level collapsible groups.
- Browser check: Playwright loaded `docs/`, confirmed the 846-law metric, confirmed collapsible main groups, and captured real-catalog screenshots.

## Screenshots

Desktop:

![Desktop category groups](https://github.com/Svetozar-Technologies/indian-law/blob/issue-33-2cb681a7da49/docs/case-studies/issue-33/category-groups-desktop.png?raw=true)

Mobile:

![Mobile category groups](https://github.com/Svetozar-Technologies/indian-law/blob/issue-33-2cb681a7da49/docs/case-studies/issue-33/category-groups-mobile.png?raw=true)
