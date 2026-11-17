# 发版约定

每次改动完成并推送到 `main` 后，**必须同时发一个 GitHub Release**，不要只 push 不发布。

规则：

1. **版本号**：上一个 Release 的 patch + 1（`0.4.1` → `0.4.2`）。同步改 `package.json` 与 `lib/util.js` 里的 `VERSION`，两处必须一致。
2. **tag**：与版本号同名，**不带 `v` 前缀**（如 `0.4.1`），与历史 `0.4.0` 保持一致。
3. **Release 标题**：留空（GitHub 会显示 tag 名），与历史一致。
4. **Release 正文**：中文，1–5 条写清楚这次改了什么、修了什么问题；用户视角，别贴 diff。
5. **创建方式**：本机已配好 git 凭据，用 GitHub API 创建即可：

   ```
   POST https://api.github.com/repos/stellar149476/dsh-lx-geteer/releases
   { "tag_name": "X.Y.Z", "target_commitish": "main", "draft": false,
     "prerelease": false, "body": "改动说明" }
   ```

   API 会自动在 `target_commitish` 处建 tag，不需要先 `git tag` + `git push --tags`。

例外：用户明确说「只改不发」、或要求指定版本号 / 大版本（minor、major）时，按用户说的来。
