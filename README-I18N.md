# GS-One v0.6.2 Bilingual UI

Default language: **en**.

- Chinese / English switch in the top-right corner.
- Preference is stored in `localStorage` (`gs_one_language`).
- `?lang=zh` and `?lang=en` can override language on entry.
- All browser-tab HTML titles are English in both modes.
- Translation runs only on known UI strings/patterns; project/script user content is not broadly machine-translated.
- REST, GraphQL, payment, upstream generation logic, database logic, and the 7-function Hobby routing remain unchanged.
