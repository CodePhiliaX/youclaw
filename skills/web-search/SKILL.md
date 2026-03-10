---
name: web-search
description: "Search the web using MiniMax web_search tool for real-time information, news, and facts."
env:
  - MINIMAX_API_KEY
tags:
  - search
  - web
priority: normal
---

# Web Search

通过 MiniMax MCP Server 提供的 `web_search` 工具搜索互联网获取实时信息。

## 使用时机

当用户需要以下信息时使用 web_search：

- 最新新闻、事件、天气
- 实时数据（股价、汇率、体育比分等）
- 你的训练数据可能过时的事实
- 特定产品、服务的最新信息
- 技术文档的最新版本

## 搜索策略

1. **构造有效关键词**：简短、精准，去掉虚词。技术问题优先用英文搜索
2. **加时间限定**：如果需要最新信息，在关键词中加入年份或 "latest"
3. **多步搜索**：先搜概览性关键词，根据结果再细化搜索
4. **交叉验证**：重要事实至少从两个来源确认

## 输出规范

- 在回答中注明信息来源（URL）
- 区分事实和推测
- 如果搜索结果不足以回答问题，如实告知
- 不要大段复制粘贴搜索结果，提炼关键信息

## 示例

用户: "Bun 最新版本是什么？"

搜索策略:
1. `web_search("Bun latest release 2026")`
2. 如果需要详细信息，用 `WebFetch` 抓取 release notes 页面

回答: 包含版本号、发布日期、关键变更，附上来源链接。
