# 分发方式：必须发布为 npm 包（不要用 git 依赖）

> **给后来的 LLM / 维护者：先读这一页。**
> 这个插件**必须以 npm 包形式分发**。任何"用 `github:user/repo` 安装"的提议都要先读完本文再决定。
> 2026-10-19 已经因此踩过一次坑，下面是完整的证据与结论。

## 一句话结论

`github:oliverkim5017/dsh-oliver-qol` 这种**无锚点 git 依赖**在 dsh 插件管理器里会持续出问题；
改成 npm 包（`dsh-oliver-qol@<version>`）后，行为与其它插件完全一致。

## 其它插件为什么不用折腾

desktop profile 里所有能正常更新的插件，依赖规格**全是 npm 版本号**：

```
dsh-opencode-go                      0.1.22
dsh-token-usage-stats                0.3.15
@linxin666/dsh-client-ui-task-board  0.4.6
dshmarket                            ^1.66.21
dsh-kimino-theme                     68.1.0
dsh-oliver-qol                       github:oliverkim5017/dsh-oliver-qol   ← 只有它是 git
```

npm 包靠**版本号**驱动更新：`0.1.22 → 0.1.23`，pnpm 立刻知道要重装，插件管理器也能明确说出装了 `包名@版本`。

## git 依赖实际踩到的三个坑

### 1. 安装期需要现场构建 → 依赖 PATH 上有 `pnpm`

git 安装拿到的是**源码 tarball**，pnpm 会为它跑一次内层 `pnpm install`（装 devDependencies）再执行 `prepare`。
这个内层调用是**裸 `pnpm` 命令**，走 PATH。

本机（`F:\dsh-home` 那台）当时**没有全局 pnpm**：

```
where pnpm        → 找不到
Get-Command pnpm  → 无结果
```

于是报 `pnpm-install: 'pnpm' is not recognized` → `ERR_PNPM_PREPARE_PACKAGE`。
修法是 `npm i -g pnpm@11`，但这本不该是使用者的负担。

### 2. `allowBuilds` 的键对 git 依赖要带完整 URL（含 commit）

按包名写不生效：

```yaml
allowBuilds:
  dsh-oliver-qol: true          # ← 对 git 依赖无效
```

必须写成带 tarball URL 的精确键：

```yaml
allowBuilds:
  'dsh-oliver-qol@https://codeload.github.com/oliverkim5017/dsh-oliver-qol/tar.gz/<commit-sha>': true
```

**键里嵌了 commit sha**，意味着每次 push 新 commit 都要改一次 profile 配置。
这正是"每次更新都要手动隔离"的来源。

### 3. 无锚点 git 规格 → lockfile 不刷新 → 插件管理器认为"没装东西"

实测（2026-10-19）：

- `node_modules/dsh-oliver-qol/package.json` → **已经是 0.2.0**，`engines.dsh: >=0.2.0-rc.2`
- 但 `pnpm-lock.yaml` 里仍是旧 commit `4e9074e8...`
- 安装日志末尾：`Already up to date` → 依赖树零变化

插件管理器靠**依赖变化**判断装了什么，看到零变化就报：

```
The plugin could not be installed
Which package was installed cannot be told from the dependency change.
```

插件其实装上了，只是管理器不认。

## 决定：发布 npm 包

理由：npm 包**带版本号**（坑 3 消失），**产物随包发布**（`files: ["lib"]` 已含构建结果，坑 1 消失），
**不需要 `allowBuilds`**（坑 2 消失）。与其它插件的体验完全一致。

### 发布流程

```bat
npm login                     :: 一次性，需要 npm 账号
npm version patch             :: 或 minor / major，按改动性质
npm publish                   :: prepublishOnly 会先构建并跑测试
```

`prepublishOnly` 是 `node scripts/build.mjs && vitest run`，保证发布的是最新构建且测试通过。

### 安装流程（发布后）

```bat
dsh plugin --profile desktop add dsh-oliver-qol
:: 或在插件管理器里搜包名安装
```

profile 里应显示 `dsh-oliver-qol: 0.2.0` 这样的版本号规格，**不再是 `github:`**。

### 升级流程

```bat
dsh plugin --profile desktop add dsh-oliver-qol@latest
```

或直接在插件管理器里点更新——版本号变了，管理器能正确识别。

## 包名状态

- `dsh-oliver-qol` 在 npm registry 上**未被占用**（2026-10-19 查证：`npm view` 返回 404）
- `publishConfig.access` 为 `public`，无需付费账号
- `private: true` 已移除（否则 `npm publish` 会被拒绝）

## 不要做的事

- ❌ 不要改回 `github:oliverkim5017/dsh-oliver-qol` 作为推荐安装方式
- ❌ 不要给 git 安装再加一层 `prepare` 绕路（`pnpm run build` 改成 `node scripts/build.mjs` 只是少依赖一层 pnpm，解决不了坑 2 和坑 3）
- ❌ 不要把 `lib/` 从 `files` 里移除——它是 npm 包免构建的关键
- ⚠️ `private: true` 不能再加回来，否则无法发布

## 相关提交

- `adf2560` 版本约束改为 `>=0.2.0-rc.2`（开放下界，dsh 升级不再被静默丢弃）
- `c45131b` 版本号 0.1.0 → 0.2.0
- 本次：移除 `private`、加 `publishConfig` 与 `prepublishOnly`、新增本文
