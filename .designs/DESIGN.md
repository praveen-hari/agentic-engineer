---
version: alpha
name: "Code Studio Engineering Workspace"
description: "VS Code-native dark theme design system for the Engineering Workspace extension"

colors:
  primary: "#CCCCCC"
  secondary: "#858585"
  accent: "#0078D4"
  background: "#1E1E1E"
  surface: "#252526"
  border: "#3C3C3C"
  success: "#4EC9B0"
  warning: "#CCA700"
  error: "#F14C4C"
  info: "#3794FF"
  surface-hover: "#2A2D2E"
  surface-active: "#37373D"
  accent-secondary: "#264F78"
  text-link: "#3794FF"
  badge-bg: "#4D4D4D"
  input-bg: "#3C3C3C"
  toolbar-bg: "#333333"
  sash: "#007ACC"

colors-dark:
  primary: "#CCCCCC"
  secondary: "#858585"
  accent: "#0078D4"
  background: "#1E1E1E"
  surface: "#252526"
  border: "#3C3C3C"
  success: "#4EC9B0"
  warning: "#CCA700"
  error: "#F14C4C"

typography:
  h1:
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "26px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "0em"
  h2:
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "0em"
  h3:
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
  h4:
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  small:
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  caption:
    fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.35
  code:
    fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5

rounded:
  sm: "2px"
  md: "4px"
  lg: "6px"
  xl: "8px"
  full: "9999px"

spacing:
  xs: "2px"
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  2xl: "20px"
  3xl: "24px"

components:
  button:
    backgroundColor: "{colors.accent}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "4px 12px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: "12px"
  input:
    backgroundColor: "{colors.input-bg}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: "4px 8px"
  badge:
    backgroundColor: "{colors.badge-bg}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  table:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    rounded: "0"
    padding: "4px 8px"
---

# Code Studio Engineering Workspace

## Overview
A VS Code-native design system using the editor's dark theme colors (editor background #1E1E1E, sidebar #252526, accent #0078D4), Segoe UI for interface text, and JetBrains Mono for code. Compact spacing (4px base) matches VS Code's information-dense layout.

## Colors
The accent blue (#0078D4) is used for interactive elements, active states, and focus rings — matching VS Code's native button and link color. Semantic colors follow VS Code's terminal palette: teal for success (#4EC9B0), amber for warnings (#CCA700), red for errors (#F14C4C). Surface colors use the VS Code sidebar (#252526) and hover (#2A2D2E) values.

## Typography
Segoe UI at 13px body size matches VS Code's native UI font. Headings use the same family with weight variation (400 for h1, 600 for h2-h4) — VS Code uses light weight for large titles. JetBrains Mono at 12px for code values, file paths, and technical data.

## Spacing
4px base grid matching VS Code's compact layout. Most internal padding is 4-8px. Section gaps are 12-16px. VS Code is denser than typical web apps — respect that density.

## Components
Buttons use the accent blue with white text and minimal 4px radius — matching VS Code's native buttons. Cards use the sidebar surface color with 1px borders. Inputs use the darker input background (#3C3C3C) with accent focus rings. Badges use the muted badge background for status indicators.

## Do's and Don'ts
Do: use the VS Code color tokens exactly, maintain compact spacing, use Codicon icons consistently, keep text at 13px body / 12px small / 11px caption.
Don't: add drop shadows (VS Code uses borders, not shadows), use rounded corners larger than 6px, add gradients, use padding larger than 16px on any element.
