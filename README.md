# Foliage

个人主页 / 资料站。Next.js 15 App Router · React 19 · Tailwind v4 · Drizzle + SQLite。

## 功能

- **书签**　分类、置顶、标签、排序、浏览器书签 HTML 导入、点击计数
- **文件站**　4MB 分片断点续传、秒传、分享码与提取口令、过期自动清理、Range 下载
- **竞赛**　四级等级、时间线、证书附件与图集
- **论文**　四种状态、DOI / 链接、BibTeX 一键复制、附件
- **后台**　`/admin`：高密度表格、行内编辑、批量删除、搜索筛选、站点设置、数据库备份

## 本地开发

```bash
npm install
cp .env.example .env.local    # 填 AUTH_SECRET / ADMIN_PASSWORD
npm run dev                   # http://localhost:3000
```

可选：`npm run db:seed` 写入演示数据（表为空时才插入）。

## 部署

宝塔面板 + PM2 + Nginx，见 [DEPLOY.md](./DEPLOY.md)。更新：`bash scripts/deploy.sh`。
