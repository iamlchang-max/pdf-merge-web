# PDF 合併網頁（本機測試 + GitHub 部署）

這是一個純前端的 PDF 合併工具，不需要後端。

## 1) 本機啟動（快速測試）

### 方法 A：Python（推薦）

```bash
cd /workspace/pdf-
python3 -m http.server 5500
```

瀏覽器打開：`http://localhost:5500`

### 方法 B：npm script

```bash
npm run dev
```

瀏覽器打開：`http://localhost:5500`

> 建議不要直接雙擊 `index.html`，改用 `http://localhost` 測試較穩定。

## 2) 功能說明（全都要）

- ✅ 多檔 PDF 合併
- ✅ 拖曳上傳（Drag & Drop）
- ✅ 檔案清單上下排序與刪除
- ✅ 每個檔案顯示頁數預覽與檔案大小
- ✅ 更清楚錯誤訊息（壞檔、非 PDF、重複檔）

## 3) 手動測試清單

1. 上傳或拖曳至少 2 份 PDF。
2. 確認每個檔案顯示頁數與大小。
3. 測試拖入非 PDF，確認會顯示略過訊息。
4. 測試重複上傳同一檔，確認會顯示重複提示。
5. 使用 `↑ / ↓` 調整順序。
6. 刪除其中一個檔案。
7. 點「合併並下載」，確認下載 `merged-YYYY-MM-DD.pdf`。
8. 點「清空清單」確認狀態重置。

## 4) 上傳到 GitHub（一次完成）

先在 GitHub 建一個空 repo（例如 `pdf-merge-web`），然後執行：

```bash
git remote add origin https://github.com/<你的帳號>/pdf-merge-web.git
git push -u origin work
```

如果你改用 `main` 分支，請改成：

```bash
git push -u origin main
```

## 5) GitHub Pages 部署

### 方式 A：Repo 設定（最快）

1. 進入 GitHub Repo → **Settings** → **Pages**。
2. Source 選 **Deploy from a branch**。
3. Branch 選 `work`（或你的預設分支）與 `/root`。
4. 儲存後等待 1~3 分鐘。

### 方式 B：GitHub Actions（已內建）

此專案已包含：`.github/workflows/deploy.yml`

- 每次 push 到 `work` 或 `main` 都會自動部署。
- 第一次請到 Repo → **Settings** → **Pages**，將 Source 設為 **GitHub Actions**。

完成後網址通常是：

`https://<你的帳號>.github.io/<repo名稱>/`
