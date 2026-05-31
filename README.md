# pHouse Web

Production landing site for the pHouse Productions website-agency offer.

## URLs

- Production: https://phouseweb.ca
- Demo/staging convention: https://demo.phouseweb.ca
- Cloudflare Pages project: `phouse-productions-demo`
- Linear project: Website Agency
- Related Linear issue: PHO-175

## Notes

- Static site deployed on Cloudflare Pages.
- Contact form endpoint: `/api/contact` via Cloudflare Pages `_worker.js`.
- Form notifications use Resend from `forms@phouseweb.ca`.
- Production form requires Cloudflare Turnstile on `phouseweb.ca` / `www.phouseweb.ca`.
- Outreach defaults: `vito@phouseweb.ca`, CC `mike@phouseweb.ca`.

## Agency defaults

- Client demos should use `https://{client-slug}.demo.phouseweb.ca`, not `pages.dev`.
- All website-agency lead/demo issues belong in the Linear `Website Agency` project.
- Every client/demo site gets a GitHub repo under `vitobot87` and the repo link goes in Linear.
