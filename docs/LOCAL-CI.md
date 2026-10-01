# Free local validation

This repository does not require GitHub-hosted runners for the personal platform. The former CodeQL workflow was removed because the GitHub account is billing-locked and cannot start Actions jobs.

Run validation locally from the repository root:

```powershell
npm test
npm --prefix web run typecheck
npm --prefix web run build
npm audit --audit-level=high
go test ./dashboard/...
```

Run these checks before pushing. GitHub remains the free source repository and backup; the application and scheduled job search continue to run on the user's PC.
