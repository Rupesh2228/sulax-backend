Render deployment notes

This document explains common issues seen when deploying this project to Render and how to fix them.

Problems reported in logs:
- "It looks like we don't have access to your repo, but we'll try to clone it anyway." — Render can't access the GitHub repository used for GitHub-connected deploys.
- "WARNING: NODE_ENV is not \"production\". Cookies use SameSite=Lax which blocks cross-origin requests." — The service is running in development mode on Render and SameSite cookie behavior will prevent cross-origin cookies.

Quick fix checklist
1. Grant Render access to your GitHub repository
   - In Render dashboard, when creating a new Web Service via "GitHub" select your repo. If Render can't see the repo, go to https://dashboard.render.com and open "Account Settings -> GitHub" and click "Connect/Install" to authorize the Render GitHub App for the organization or personal account that owns the repository.
   - If your repo is private, ensure you selected the correct organization and the Render GitHub App is installed for that repo.
   - Alternatively, use "Manual" deploys (upload a tar/zip) if you do not want to connect the repo.

2. Set required environment variables in the Render service settings
   - NODE_ENV=production
   - MONGO_URI (your MongoDB connection string)
   - JWT_SECRET (minimum 32 characters)
   - CLIENT_ORIGIN (one or more comma-separated client origins, e.g. https://sulax-frontend.vercel.app)
   - ADMIN_EMAIL and ADMIN_PASSWORD (used by the seed command to create or synchronize the admin account)
   - Optional: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT for web push
   - In Render > Service > Environment > Add Environment Variable

   If the admin login returns "Invalid email or password", the login uses the account stored in MongoDB; it does not authenticate directly against these environment variables. Run `npm run seed` against the same MongoDB database configured by the Render service to create or synchronize the admin account. For a production database, use the Render Shell if available, or run the command from a trusted machine with the production `MONGO_URI` configured securely. The seed command also inserts sample products if the database has none. Synchronizing an existing account sets its role to admin, updates its password when needed, and invalidates its existing sessions.

3. Node version and build command
   - Set the Node version to at least 18 (match package.json engines if present). In Render service settings, set "Environment" -> "Runtime" -> Node version.
   - Build command: npm install (or the build command your repo expects). Start command should point to the server entry (handled by package.json scripts).

4. Cookie / cross-origin behavior
   - When NODE_ENV=production, the server sets cookie sameSite to 'none' and secure=true to allow cross-origin cookies over HTTPS. Ensure CLIENT_ORIGIN contains the frontend origin.

5. Verify deployment
   - After setting env vars and granting repo access, trigger a new deploy from Render. Inspect the deploy logs; the previous warning should be gone if NODE_ENV=production.

If problems persist
- Check the deploy logs for precise errors (missing env vars, build failures).
- If Render can't clone, either grant access in GitHub or use manual deploy.
- If you want, paste the specific deploy log lines and this project can be updated to make the messages more actionable or to adapt the configuration.

References
- Render docs: https://render.com/docs
- How to connect GitHub: https://render.com/docs/deploy-from-github
