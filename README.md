# SVG Editor CLI

Lab1 Phase 1：TypeScript 面向对象的 SVG 命令行编辑器。

## 运行

需要 Node.js 22 或更新版本。

```sh
npm ci
npm run cli
```

进入后显示 `svg>`。输入 `help` 查看完整语法，`quit` / `exit` 或 Ctrl+D 退出。

```text
init 800 600
create g scene
create rect node 120 100 160 60 #4a90d9 in scene
create text label 155 135 "开始" in scene
move scene 0 100
undo
tree
save demo.svg
```

保存的 SVG 可直接用浏览器打开。双引号支持带空格的文字、路径，以及 `\"`、`\\` 转义；以 `#` 开头的整行作为注释，颜色中的 `#` 保留。

## 回放与检查

```sh
npm run demo
npm run cli -- --script examples/flowchart.commands
npm run cli < examples/flowchart.commands
npm run check
```

演示在当前工作目录生成 `flowchart.svg`。编译后可直接使用 `node dist/src/main.js`；测试运行器使用 Node 自带的 `node:test`。

## 作业材料

- [架构方案、过程记录、一致性自查、质量保证](doc/README.md)
- [原始作业说明](phase_cli_1.md)
- [流程图脚本](examples/flowchart.commands)
- [外部 SVG 导入样例](examples/other.svg)

支持 `rect` / `circle` / `ellipse` / `line` / `text` / `g`。本阶段按题目边界拒绝 `box`，详细语义与导入范围见作业文档。
