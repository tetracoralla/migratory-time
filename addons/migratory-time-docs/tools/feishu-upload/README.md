# Isolated Feishu uploader

The current official `@lark-opdev/cli` release still carries an obsolete dependency tree with known audit findings. It is not part of the add-on's normal install, build, test, or local preview environment.

Use this directory only when uploading a reviewed `../../dist` build to Feishu. Do not run it against untrusted source trees or while browsing untrusted sites, and do not use its development server. Install it separately immediately before upload:

```bash
npm ci
npm audit --omit=dev
cd ../..
npm run upload
```

The wrapper accepts only the add-on's generated `dist` directory and requires the Feishu project metadata files before invoking `opdev upload`.
