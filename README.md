# Agency Builder CRM

Sales CRM for The AI Agency Builder sales team. This repo is the **clickable prototype**: one static `index.html`, no backend.

## Status

Prototype only. Not ready for real client data.

1. **Sign in is simulated.** The demo account is `ali@theaiagencybuilder.com` with code `246810`, hardcoded in the page. Anyone who reads the source can see it. Do not put real data behind it.
2. **Data saves only in the browser** (localStorage). Nothing is shared between people or devices.
3. **Ask (the chat) only works inside Claude.** Outside Claude the panel says it is unavailable.

## What it does

1. **Dashboard:** won in the last 30 days, open pipeline, close rate, revenue by week, and open value by stage.
2. **Pipeline:** board and list views, drag and drop between stages, and editable pipelines and stages.
3. **Contacts:** sortable table, tags, and a contact panel with notes, call logging and activity history.
4. **Filters and saved views:** owner, due date, source, tag and "going cold".
5. **Projects:** delivery checklists for won deals.
6. **Security screen:** sign in rules, roles, sessions and an activity log (UI only).
7. **Empty start:** the CRM starts empty. Security, Workspace data, Load sample data fills it with made up records for demos.

## Run it

Open `index.html` in a browser, or serve the folder:

```
npx serve .
```

To host it, drag the folder into Netlify Drop or connect this repo to Netlify. No build step.

## Real build plan

1. **Stack:** React and Supabase on Netlify, the same as the onboarding app.
2. **Auth:** Supabase Auth with Google sign in and email codes, locked to the `theaiagencybuilder.com` domain.
3. **Access:** row level security on every table. Closers and setters edit only their own deals. Managers see the team. Admins export.
4. **Tables:** contacts, deals, pipelines, stages, activities, tags, projects, tasks, team members, audit log.
5. **Ask:** runs on the server through the Claude API and only sees what the rep's role allows. Add a daily limit per rep.
6. **Import:** CSV import from the current spreadsheets, so reps can switch.
