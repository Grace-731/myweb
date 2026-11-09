# 张嘉铭 · 个人档案馆

互动作品集的 GitHub Pages 版本。网站使用原生 HTML、CSS、JavaScript，无需安装依赖或构建。

## 发布到 GitHub Pages

1. 在 GitHub 创建仓库，例如 `jiaming-ai`。使用 GitHub Free 发布时，选择公开仓库。
2. 将本目录的**内容**上传至仓库根目录，保留原有目录结构。上传后应能在仓库首页直接看到 `index.html`。使用网页上传时，如果文件选择器省略 `.nojekyll`，可在仓库根目录用 **Add file → Create new file** 单独补建该文件。
3. 打开仓库的 **Settings → Pages**，将 **Source** 设为 **Deploy from a branch**，选择 `main` 和 `/(root)`，然后保存。
4. 部署完成后，从 **Settings → Pages** 获取网址。普通项目仓库的网址格式为 `https://你的用户名.github.io/仓库名/`。

参见 [GitHub Pages 官方发布指南](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

## 文件结构

| 路径 | 用途 |
| --- | --- |
| `index.html` | 首页入口 |
| `style.css` | 网站样式、响应式布局与动画 |
| `app.js` | 人物切换、开场视频、详情弹窗与案例交互 |
| `data/config.json` | 简历文字、案例内容与素材路径 |
| `assets/` | 人物、视频、项目截图、照片及证书 |
| `projects/365/` | 365 跨境客服 FAQ 演示和工作台截图 |
| `.nojekyll` | 让 GitHub Pages 直接发布静态文件 |

## 本地预览与更新

在本目录运行 `python3 -m http.server 8000`，浏览器访问 `http://localhost:8000/`。通过 HTTP 访问时，浏览器可以加载 JavaScript 模块与 JSON 配置。

更新后，将修改提交到 Pages 选定的分支。案例中的外部项目链接由相应站点提供。365 FAQ 演示的数据随网站一同发布。
