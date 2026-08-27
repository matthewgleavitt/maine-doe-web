# DOE Calendar — Deployment Guide

Everything needed to replace the current Elfsight calendar at `www.maine.gov/doe/calendar` and update the internal events tracker.

---

## 1. Apps Script (already deployed)

If not yet:
- Replace `Code.gs` with the updated version
- Set Script Property `EVENTS_ADMIN_TOKEN` to a long random string
- Deploy → New version

Sanity check:
```
https://script.google.com/macros/s/AKfycbw98yVhSSYfD2HhJGilZBYYE_dc_R9lY4ZKNxmRRyzHXVvQdVyPkBg_iYXDcAygSkqnTQ/exec?type=calendar
```
Should return `{ events: [...], count: N, generated: "..." }`.

---

## 2. Calendar on Drupal — `/doe/calendar`

Three pieces to install:

### 2a. Drupal page body

- Edit the `/doe/calendar` page (Basic Template or whatever content type it is)
- Set text format to **Full HTML**
- Delete the existing Elfsight embed
- Paste the entire contents of `drupal-body.html`
- Save (don't publish yet if you want to preview)

### 2b. CSS Injector rule

- Structure → CSS Injector → Add CSS rule
- **Label:** DOE Calendar
- **CSS:** paste the entire contents of `drupal-css-injector.css`
- **Rules:** show CSS on specific pages → `doe/calendar`
- Save

### 2c. JS Injector rule

- Structure → JS Injector → Add JS rule
- **Label:** DOE Calendar
- **JavaScript:** paste the entire contents of `drupal-js-injector.js`
- **Rules:** show JS on specific pages → `doe/calendar`
- **Placement:** Footer (loads after DOM)
- Save

### 2d. Verify

- Open `www.maine.gov/doe/calendar` in an incognito window
- Should see the calendar with all events
- Try filtering by focus area, type, view mode
- Click an event → modal opens with details
- Sanity check the console for errors

If it looks broken:
- Clear Drupal cache
- Hard-refresh the browser (Cmd/Ctrl+Shift+R)
- Check that the CSS Injector and JS Injector rules are both **enabled** and scoped to `doe/calendar`

---

## 3. Events Tracker on the gateway

Upload the new `events-tracker.html` (from `comms-portal/`) to:

```
gateway.maine.gov/doe/communications/events-tracker.html
```

Replacing the existing file. That's the only change on the gateway.

### Verify

- Open `gateway.maine.gov/doe/communications/events-tracker.html`
- Should see the hero + "Submit new event" button
- Click **Submit new event** — form modal opens with all sections
- Fill in a test event, verify the live preview updates
- Submit — check that the event lands in the Sheet
- Click **Admin mode**, paste your `EVENTS_ADMIN_TOKEN` — you should see the admin table with Edit + Cancel buttons on each row

---

## 4. Rollback plan

If anything goes wrong:

**Calendar:**
- Disable the CSS Injector + JS Injector rules for `/doe/calendar`
- Put the old Elfsight embed back into the page body

**Events tracker:**
- Restore the previous `events-tracker.html` on the gateway

**Backend:**
- The Apps Script deployment can be rolled back to a previous version via Deploy → Manage deployments → previous version

---

## 5. Post-launch touch-ups (as needed)

- **Cache**: currently the calendar fetches without cache-busting. Apps Script caches responses for 5 minutes. If you publish a new event and want it visible immediately, run `purgeCalendarCache` from the Apps Script editor.
- **Retire Elfsight**: once the new calendar is stable for a week, cancel the Elfsight subscription.
- **Consider iCal feed**: I can add an `?type=calendar&format=ics` endpoint so people can subscribe to DOE events in their own Outlook/Google Calendar. Phase 2 if you want it.

---

## Files in this package

| File | Where it goes |
|---|---|
| `Code.gs` | Apps Script project (replace entire file) |
| `drupal-body.html` | Drupal page body for `/doe/calendar` (Full HTML) |
| `drupal-css-injector.css` | CSS Injector rule, scoped to `doe/calendar` |
| `drupal-js-injector.js` | JS Injector rule, scoped to `doe/calendar` |
| `events-tracker.html` | Upload to gateway, replacing existing file |
