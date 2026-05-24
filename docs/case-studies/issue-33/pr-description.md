Fixes #33.

## Summary

- Adds `data/law-categories.lino` with a reviewable Links Notation taxonomy and classification rules.
- Updates the site build to emit `catalog.categories` and one stable `law.category` per generated law.
- Groups the home law list into native collapsible category sections without duplicating laws.
- Documents the related-app study, source research, reproduction logs, verification logs, and screenshots under `docs/case-studies/issue-33`.

## Reproduction

The focused regression test was added first. Before the implementation it failed because generated catalogs had no `categories` array and the frontend had no `groupLawsByCategory` helper. The saved failure is in:

`docs/case-studies/issue-33/pre-fix-focused-tests.log`

## Verification

- `node --test tests/catalog-status.test.mjs tests/build-site.test.mjs` passed 19 tests.
- `npm test` passed 47 tests.
- `npm run build:offline -- --output /tmp/indian-law-issue-33-site` generated a catalog with all 13 taxonomy categories.
- Playwright rendered the generated site at desktop and mobile widths.

## Screenshots

Desktop:

![Desktop category groups](https://github.com/Svetozar-Technologies/indian-law/blob/issue-33-2cb681a7da49/docs/case-studies/issue-33/category-groups-desktop.png?raw=true)

Mobile:

![Mobile category groups](https://github.com/Svetozar-Technologies/indian-law/blob/issue-33-2cb681a7da49/docs/case-studies/issue-33/category-groups-mobile.png?raw=true)
