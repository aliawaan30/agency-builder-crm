# Agency Builder CRM

Sales CRM for The AI Agency Builder team. React and Vite on Netlify, Supabase for login, database and the Ask function.

## What it does

1. **Login:** Google or a 6 digit email code. Invite only: an email not on the invite list cannot create an account.
2. **Roles:** Admin, Manager, Closer, Setter, enforced by row level security in the database, not just the screen.
3. **Dashboard:** won in the last 30 days, open pipeline, close rate, revenue by week, open value by stage.
4. **Pipeline:** board and list views, drag and drop, editable pipelines and stages.
5. **Contacts:** sortable table, filters, saved views, tags, several deals per contact, call and note logging, activity history.
6. **CSV import and export:** import the current spreadsheet with column matching and duplicate checks. Export is admin only.
7. **Projects:** delivery checklists, started from a won deal.
8. **Team:** invites, roles, removing access, sign out other devices, activity log.
9. **Ask:** questions about the pipeline, answered by Claude on the server with only the data that person can see. Daily limit per person.
10. **Live updates:** changes from teammates appear without a refresh.

## Roles

| Role | Sees | Edits | Team |
| --- | --- | --- | --- |
| Admin | Everything | Everything | Invites any role, changes roles, removes access, exports |
| Manager | Everything | Everything | Invites closers and setters |
| Closer | Everything | Own contacts and deals, any notes and calls | None |
| Setter | Everything | Own contacts and deals, any notes and calls | None |

## Setup

Do these in order. About 45 minutes the first time.

### 1. Supabase project

1. Create a new project at supabase.com. Put it under the company or Blake's account so the business owns the data. Pick the Sydney region if most of the team is in Australia.
2. Open **SQL Editor**, paste all of `supabase/migrations/001_crm.sql`, and click **Run**. This creates the tables, the security rules and the two starting pipelines.
3. Invite the first admins in the same SQL Editor (use the exact emails they will sign in with):
   ```sql
   insert into public.team_invites (email, role, full_name) values
     ('ali@yourdomain.com', 'admin', 'Ali Nawaz'),
     ('blake@yourdomain.com', 'admin', 'Blake Stephens');
   ```
   Everyone else gets invited from the Team page inside the CRM.

### 2. Email codes

1. **Authentication, Emails, SMTP:** add Resend (or another SMTP). The built in sender only allows a few emails an hour.
2. **Authentication, Emails, Templates:** replace the body of both **Confirm signup** (used the first time someone signs in) and **Magic Link** (used after that) so they send the code:
   ```html
   <h2>Your sign in code</h2>
   <p>Enter this code in the CRM: <strong>{{ .Token }}</strong></p>
   <p>It expires in 10 minutes. If you didn't try to sign in, ignore this email.</p>
   ```
3. **Authentication, Sign In / Providers, Email:** set the email OTP expiry to 600 seconds.
4. Leave **Allow new users to sign up** on. The invite list is what blocks strangers. Turning sign ups off would block invited people too.

### 3. Google sign in

1. In Google Cloud Console, create a project, then **APIs and Services, OAuth consent screen**. If the team uses Google Workspace, choose **Internal** so only company accounts can use it.
2. **Credentials, Create credentials, OAuth client ID, Web application.** Under Authorized redirect URIs add `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`.
3. In Supabase, **Authentication, Sign In / Providers, Google:** turn it on and paste the client ID and secret.

### 4. Netlify

1. In the Netlify site connected to this repo, add two environment variables under **Site configuration, Environment variables**:
   1. `VITE_SUPABASE_URL`: from Supabase, Project Settings, API, Project URL.
   2. `VITE_SUPABASE_ANON_KEY`: the anon public key from the same page.
2. Redeploy. `netlify.toml` already sets the build command, the `dist` folder and page routing.
3. Back in Supabase, **Authentication, URL Configuration:** set Site URL to the Netlify address and add it under Redirect URLs as well.

### 5. Ask (Claude)

Ask runs as a Supabase Edge Function so the Claude key never reaches the browser. From this repo folder:

```
npx supabase login
npx supabase link --project-ref YOUR-PROJECT-REF
npx supabase secrets set ANTHROPIC_API_KEY=your-key
npx supabase functions deploy ask
```

Optional secrets: `ANTHROPIC_MODEL` (default `claude-haiku-5-5`, change it if Anthropic renames models) and `ASK_DAILY_LIMIT` (default 60 questions per person per day).

Ask sends CRM data (names, deal values, recent notes) to Anthropic to answer each question. It only reads what that person's role allows.

## Local development

```
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev
```

## Notes and limits

1. All contacts and deals load into the browser. That is fast up to roughly 10,000 deals. Past that, add server side paging.
2. Activity history refreshes when a contact is opened, not live.
3. Values are in USD only.
4. There is no two factor login yet beyond Google and email codes. Supabase supports TOTP if it's needed later.
5. `docs/prototype.html` is the original clickable prototype, kept for reference. It is not deployed.
