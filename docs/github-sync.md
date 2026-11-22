# Export and sync to GitHub

## Push the extension source to an existing GitHub repository

1. Use **Export ZIP** in the Forge workspace and extract `forge-vscode-agent/` locally.
2. Create an empty repository on GitHub, or use a repository you already control.
3. In the extracted folder, review the files and confirm no provider token or `.env` file was added.
4. Run:

```sh
git init
git add .
git commit -m "Build Forge VS Code agent starter"
git branch -M main
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

Replace `OWNER/REPOSITORY` with your GitHub repository. GitHub prompts for your normal authenticated sign-in; never paste a token into the source files or commit history.

## Connect this Lovable workspace

In Lovable, open **Project settings → Git** and choose **Connect GitHub**. The connection creates a new private repository and keeps the selected branch in sync. Lovable Git sync does not attach to an existing repository; use the ZIP instructions above if you need to push this extension folder into a repository you already own.

## Keep in mind

- The extension archive and the Lovable app repository are separate deliverables.
- Keep the synced branch buildable and do not rewrite published history.
- A ZIP export is a snapshot; subsequent app changes require another export or a connected Git sync.