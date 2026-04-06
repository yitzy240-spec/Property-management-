# ApartmentOS QA Round 1 — Response to Ariel

## Important Change — Admin vs Owner Access

We've separated the admin and owner experiences into different entry points:

- **For you (admin):** Go to `/admin` — this takes you to the full dashboard with properties, bills, tasks, financials, settings, etc. Save this as your home screen shortcut: `property-management-eight-liart.vercel.app/admin`
- **For owners:** They just go to the main URL (`property-management-eight-liart.vercel.app`). It defaults to the Owner login tab. They enter their email, get a magic link, and land on their portal showing only their properties.
- The login page now defaults to Owner since that's who will use it most. When you need admin access, just switch to the Admin tab or go directly to `/admin`.
- A PWA install banner now prompts users to add the app to their home screen. It disappears once installed.

---

## Fixes

1. **Owner login loop** — The magic link had no callback route to exchange the auth token, so it dropped you back at login. **Added an auth callback route that exchanges the token and redirects to the owner portal.** (Note: make sure `https://property-management-eight-liart.vercel.app/auth/callback` is in the Redirect URLs in Supabase → Authentication → URL Configuration.)

2. **Default to Owner tab** — Was defaulting to Admin, confusing for owners who don't know to switch. **Changed default to Owner tab.** See the admin/owner split above.

3. **Site trust warning** — This is because we're on a Vercel subdomain with shared SSL. **Once we set up a custom domain (e.g. `app.marcusproperties.com`), the warning goes away.** Do you have a domain you'd like to use?

4. **Keren Hayesod / Skyline mixup** — Keren Hayesod was incorrectly linked to the Skyline Lodgify listing, pulling in the wrong bookings and photos. **Split Jerusalem Skyline into its own property under Kalman's portfolio and cleaned up the mismatched bookings.** Keren Hayesod Apt 3 and Apt 26 are now separate and unlinked from Lodgify (since they're not listed on the platform).

5. **Can't change owner profile** — Owner rows on the Owners page weren't clickable, so you couldn't reach the edit form. **Made them clickable — tap any owner to see their detail page with a full edit form for profile type (Investor/Hybrid/Private), email, phone, and notes.**

6. **Currency showing $ as ILS** — Lodgify lists nightly prices in USD (for international marketing) but booking payout amounts are in ILS. The app was mixing them up. **Confirmed the booking amounts are ILS and made the display consistent with proper currency labels.**

7. **Booking order** — Was showing oldest first (September) instead of next upcoming. **Flipped to ascending so the next booking shows first.**

8. **YTD revenue 95K** — Was reading from old sample data we seeded during setup, not from actual bookings. **Switched to calculate directly from real synced booking revenue.**

9. **Lodgify sync pulling cancelled bookings** — The sync was pulling everything including cancelled, declined, and inquiry bookings. **Added a status filter to only sync confirmed bookings. Also cleaned up 3 phantom Jerusalem Skyline reservations that were actually cancelled.**

10. **Jerusalem Skyline phantom bookings** — These were caused by the Keren Hayesod mapping issue (#4) plus the cancelled booking issue (#9). **Both fixed — Skyline now has only 1 confirmed booking.**

11. **Bills — can't see the actual bill to approve** — The current bills are sample data from initial setup and don't have real PDFs attached. **Once you connect Gmail (the Google button in Settings), the system will automatically scan your inbox for utility bill emails, extract the PDFs, parse them with AI, and attach the originals.** You'll be able to view and download the actual bill before approving.

12. **Tasks are demos** — Correct. These are sample data from setup. **Real tasks get created automatically (cleaning tasks from upcoming checkouts, seasonal maintenance from templates) or manually via the New Task button.** You can now also create tasks directly from a property's detail page — the property is pre-selected.

13. **Would adding a booking sync back to Lodgify?** — It does now. **When you add a booking in ApartmentOS, it automatically pushes to Lodgify so both systems stay in sync.** You'll see a toast confirming "Booking added + synced to Lodgify."

14. **Add bill dropdown only showing 1 apartment** — The property list was blocked by a database permissions issue, returning almost nothing. **Switched to use a server-side route that has full access. All properties now appear in the dropdown.** You can also add bills directly from a property's detail page with the property pre-selected.

15. **Reports — earnings showing 0 and crash** — Earnings were 0 because no report data had been generated yet (it's a new feature). The crash when downloading a Green Invoice PDF was caused by missing error handling when the download link wasn't available. **Added proper error handling so it fails gracefully instead of crashing.**

16. **Lodgify integration status showing 0** — Was checking the wrong API endpoint which always returned 0. **Now checks the properties list and correctly shows the linked count (e.g. "4/7 linked").**

17. **Ben got a sign-in email** — Yes, we set up his owner account during testing so we could verify the owner portal flow. **No action needed** on his end unless he wants to check it out.

18. **Inventory — auto-text laundry with magic link** — Built it. **The "Request Pickup" button on the Inventory page now opens a drawer with Rafael's Dry Cleaning number pre-filled.** It uses your Hebrew message template (`אשמח לאיסוף מ(דירה) כביסה מוכנה בשקיות. צריך איסוף היום עד השעה...`). Select the property, set the pickup time, preview the message, and tap "Send via WhatsApp." Also available from each property's detail page.

---

## New Features Added

- **Two-way Lodgify sync** — Bookings you add push to Lodgify automatically.
- **WhatsApp laundry pickup** — Smart Hebrew message to Rafael's with property + time pre-filled.
- **PWA install banner** — Prompts users to install, disappears once installed.
- **Admin/Owner split** — `/admin` for you, `/` for owners.
- **Property detail as action hub** — Add Task, Add Bill, Laundry Pickup, and Magic Link all available inline from each property page with the property pre-selected.

---

## Still Need From You

- Do you have a custom domain for the trust warning? (e.g. `app.marcusproperties.com`)
- Is Michael.Luxenberg@yahoo.com the correct email for Bobbi & Michelle?
- Any YouTube tutorial videos for Agripas 8 or Mesila?
