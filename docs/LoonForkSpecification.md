# Loon Fork Specification

此个人用途 fork 基于 Biliverse/Redirect v0.2.25（`a4c32dd3de1a4323b8c3b569630565d378da0cda`），许可证仍为 Apache-2.0。只向 Teragion/Redirect 提交、发布，不向上游提交 PR。

## 安装与参数

- 最低版本：Loon 3.5.1 (978)，开启 Rewrite；HTTPS 视频请求还需要有效的 MitM 解密。
- 安装地址：`https://github.com/Teragion/Redirect/releases/download/v0.2.25-loon.2/BiliBili.Redirect.plugin`。
- 禁用旧版 Redirect 插件及重复 CDN 规则，重新安装本 fork。参数名称变化后需重新选择原有自定义值。
- `HostOverseaVideo` 默认 `upos-sz-mirrorcos.bilivideo.com`，例如将 `upos-sz-mirrorcosov.bilivideo.com` 改为国内腾讯 CDN。
- `HostBStar` 保留原默认目标 `upos-sz-mirrorali.bilivideo.com`。
- 这两项由 Loon 插件原生参数控制。BoxJS 的 `Host.OverseaVideo`/`Host.BStar` 仍供其他客户端使用，不控制此插件的原生 Rewrite；`Storage` 只影响剩余 PCDN/MCDN 请求脚本。此前原生 URL Rewrite 也未读取 BoxJS。
- `Host.PCDN`、`Host.MCDN` 和脚本设置结构保持原样；仅用于原生 Rewrite 的参数移除点号，避免与新版变量路径/捕获名称混淆。

## 重写边界

OverseaVideo/BStar 仅匹配 `/upgcxcode/` 视频请求。`request if ... then url.replace(...)` 使用命名捕获保留 HTTP/HTTPS；只替换 URL 的协议与主机部分，后面的路径、查询字符串、百分号编码、重复参数保持原始字节。沿用上游端口处理：移除源 CDN 的 80/443/4483 端口，由目标使用该协议默认端口。

两类 CDN 不再触发旧的宽泛请求脚本。OverseaVideo 在 BStar 之前执行，防止 BStar 选择海外目标后又被当作 OverseaVideo 改写。普通国内 CDN 不受影响。

PCDN/MCDN 继续使用未经修改的上游脚本：PCDN 优先 `xy_usource`，否则使用 `Host.PCDN`；MCDN `/v1/resource/` 不变，`/upgcxcode/` 使用原代理包装，并保留 `originalUrl` 旁路。PCDN/MCDN 原本就可能改变协议或包装完整原始 URL，本修复不改变这些语义。协议及路径/查询字节不变的承诺针对原生 OverseaVideo/BStar URL 替换。

语法依据：[Loon Rewrite 官方文档](https://nsloon.app/docs/Rewrite/rewrite_v2/)。旧 `header` 是 URL 替换动作名称，并非单纯设置 HTTP Host；本次修复重点是正确绑定插件参数、使用新版语法和消除重复处理。

## v0.2.25-loon.1 构建来源与验证

插件及 `BiliBili.Redirect.boxjs.json` 使用公开 npm 包 `@iringo/arguments-builder@1.8.5` 和本 fork 模板/参数定义新生成。正式插件的全部执行脚本、Mock JSON 地址指向本 fork 的固定版本 Release。

`request.bundle.js` 原样复用上游 v0.2.25 发布资产，**没有在本环境重新编译**：

- 来源：`https://github.com/Biliverse/Redirect/releases/download/v0.2.25/request.bundle.js`
- SHA-256：`f52bd73add6953cd3bc1484364e6feae803fbac14b15a1171568236ab5af9785`
- 本地下载校验值与 GitHub Release API 的资产 digest 一致；脚本显示上游 `0.2.25` 版本号是预期行为。
- 发布包附带原始 `LICENSE`、`PROVENANCE.json`、`SHA256SUMS`。
- 本版只发布正式 Loon 插件；开发版模板同样修复并测试，但不将缺少对应开发脚本的 `.dev.plugin` 作为安装产物发布。

首次发布时，执行 `npm ci --ignore-scripts` 在 GitHub Packages 返回 401 Unauthorized。`.npmrc` 依赖 `NODE_AUTH_TOKEN` 访问 `@nsnanocat/*` 和 `@biliverse/*`。用户无此类令牌，故完整 `npm test` 的源码运行时测试无法加载依赖，`npm run build` 也未成功（安装失败后缺少 npm-run-all）。没有声称完整源码构建成功。

原 Actions 构建工作流引用 `PACKAGE_TOKEN` 和 `SUBMODULE_TOKEN`；fork 不继承上游 secrets，本版使用手工配置生成与已发布脚本复用，不依赖这些工作流完成发布。若以后修改请求脚本，必须重新完整构建，不能继续复用旧脚本冒充新构建。当前源码的公开 npm 构建方式见下节。

定向命令（Node.js 22.18+ 的 TypeScript 类型剥离支持，以及已安装的公开构建器）：

```sh
npm run build:loon:config
LOON_PLUGIN_DIR=dist REDIRECT_BUNDLE=dist/request.bundle.js npm run test:loon
```

`test:loon` 包含 15 项测试：两个模板的真实 Handlebars/ArgumentsBuilder 输出、所有现有目标选项展开、协议与原始路径/查询保留、非目标域名、脚本匹配互斥、其他客户端/BoxJS 参数结构，以及实际发布脚本在隔离 Loon API 环境中的 PCDN/MCDN 行为。原生 Rewrite 部分按官方语义模拟；它不是 Loon 解析器或 iOS 网络栈测试。完整测试的实际结果为 17 项通过、1 个测试文件因缺失 `@nsnanocat/util` 无法加载（cloudRuntime），并非全绿。

## 当前源码构建：公开 npm 源

四个依赖的原锁定版本均已确认可从 `https://registry.npmjs.org/` 匿名安装：`@biliverse/protobuf@1.0.0`、`@nsnanocat/grpc@1.1.0`、`@nsnanocat/url@1.2.6`、`@nsnanocat/util@2.7.5`。不需要 `NODE_AUTH_TOKEN` 或 `PACKAGE_TOKEN`，未升级任何依赖版本。

`.npmrc` 使用公开源；锁文件同步公开 tarball 地址和完整性校验。`protobuf@1.0.0` 两个 registry 记录的 tarball 校验值不同，不能声称压缩包逐字节相同；当前源码没有导入该包，但保留依赖并使用 npm 发布物的校验值。`grpc` 和 `util` 的校验值相同，`url` 原锁记录缺少地址与校验值，现已补齐。

```sh
npm ci
npm run build
npm run build:dev-args
npm run build:dev
LOON_PLUGIN_DIR=dist REDIRECT_BUNDLE=dist/request.bundle.js npm test
```

2026-10-28 在 Node.js 25.2.1 / npm 11.6.2 下，未设置 `NODE_AUTH_TOKEN`，安装、正式版及开发版构建成功；实际生成的插件和请求脚本通过全部 20 项测试，无跳过。正式版 Egern YAML 已确认非空。生成 Egern 配置需要 Puppeteer 启动 Chrome，本机 Codex 受限执行环境启动失败，在获准的沙箱外执行成功；未禁用 Chrome 沙箱。构建器可能记录转换错误却仍返回退出码 0，因此不能只依据进程退出码判断完整构建成功。

共享 Actions 改用 `npm ci`，移除 Packages Secret 输入，安装与构建共用 Puppeteer 缓存；checkout 使用默认 GitHub token（当前仓库无子模块）。正式 Build 保留 Egern 产物检查，并执行含真实请求脚本的测试。Cloudflare、Gist 等部署仍需要对应服务凭据。这些工作流修改尚未在 GitHub runner 上执行验证。

上述是当前源码的本地构建验证，不改变已发布 `v0.2.25-loon.1` 的资产或来源声明。

## 如何验证实际 CDN 连接 IP

本版没有在用户设备上运行 Loon，因此**未验证最终连接 IP 已改变**。URL、Host、DNS 查询结果都不是最终连接地址的充分证据；不同域名也可能解析到同一 IP。

1. 在 Loon 启用本插件和 Rewrite，确认 `HostOverseaVideo` 为 `upos-sz-mirrorcos.bilivideo.com`。HTTPS 测试要确认请求已成功 MitM；仅看到 CONNECT、TLS 或 QUIC/UDP 连接时，不能据此判定 HTTP Rewrite 生效。
2. 关闭播放器并重新建立连接，选择一个未缓存的视频片段。分别在禁用和启用插件时记录同类请求；不要复用已下载缓存或旧的长连接。
3. 在该视频请求详情确认完整 URL 目标为 `upos-sz-mirrorcos.bilivideo.com`，并核对路径、签名和查询参数。随后记录实际连接的远端/目标 IP、端口、连接时间及所用策略。字段名称可能随 Loon 版本变化；若详情不显示实际 socket 目标，不能用 URL 代替。
4. 若走 DIRECT，在同一网络路由器或设备抓包中定位对应连接的 TCP SYN/远端地址，并与 Loon 实际使用的目标域名 DNS 解析结果对照。同时记录旧 `mirrorcosov` 的连接基线。IPv4/IPv6 都应考虑；若两域名当前共享 IP，只能证明请求目标切换，不能宣称 IP 数值变化。
5. 若走代理，iPhone 对外的 socket 通常连接代理节点，该 IP 不是最终 CDN。须查看代理出口服务器的目标连接日志或在出口抓包，确认出口实际向哪个 CDN IP 建立连接。只有出口这一层的证据才能确认最终 CDN IP。

可以在与待测连接相同的解析/出口环境用 `dig upos-sz-mirrorcos.bilivideo.com A` 和 `dig upos-sz-mirrorcos.bilivideo.com AAAA` 作参考；DoH/远端 DNS/CDN 调度可能使电脑查询结果不同。`curl -v` 只证明 curl 自己的连接，不证明 iPhone 上的 Loon 连接。
