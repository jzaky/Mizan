# Mizan

Financial statement analysis that shows its work.

## Deploy

1. `npm install`
2. Push to GitHub, connect the repo in Netlify.
3. Netlify > Site settings > Environment variables > add `ANTHROPIC_API_KEY`.
4. Deploy. The site serves at your Netlify URL, the function at `/api/analyze`.

## The key

The key is read by `netlify/functions/analyze.js` from `process.env` at request time.
It is never bundled into `dist/` and never reaches the browser.

Do not move the fetch call back into the frontend. That is what exposes a key.

## Local

`npm install -g netlify-cli` then `netlify dev`.
Put `ANTHROPIC_API_KEY=...` in a local `.env` (gitignored).
Plain `npm run dev` runs the UI but `/api/analyze` will 404.

## Notes

- Text-based PDFs read best. Scans depend on page image quality.
- `max_tokens` is 8000 in the function. Raise it for very long annual reports.
- The balance check runs in the browser, not in the model.
