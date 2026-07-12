import { type FunctionalComponent } from 'preact';

/**
 * Codicon icon set used by the Tasks screen and related components.
 *
 * Codicons are VS Code's icon font. In the webview they are loaded via
 * the `@vscode/codicons` CSS, which the extension host injects through
 * `localResourceRoots`. We render a `<i class="codicon …">` element so
 * the font ligature / ligature-free rendering both work.
 *
 * Only the subset of icons used by the Tasks screen is typed here so
 * callers get autocompletion and we avoid typos that silently render
 * a blank glyph.
 */
export type IconName =
  | 'rocket'
  | 'sparkle'
  | 'loading'
  | 'pass-filled'
  | 'circle-outline'
  | 'warning'
  | 'shield'
  | 'package'
  | 'tasklist'
  | 'file-code'
  | 'file-text'
  | 'chevron-down'
  | 'chevron-right'
  | 'play'
  | 'add'
  | 'history'
  | 'refresh'
  | 'close'
  | 'pass'
  | 'check'
  | 'info'
  | 'error'
  | 'lightbulb'
  | 'beaker'
  | 'gear'
  | 'list-tree'
  | 'layers'
  | 'git-branch'
  | 'terminal'
  | 'book'
  | 'archive'
  | 'clock'
  | 'flame'
  | 'snowflake'
  | 'leaf'
  | 'folder-library'
  | 'circle-slash'
  | 'pulse'
  | 'tools'
  | 'search';

interface IconProps {
  readonly name: IconName;
  readonly size?: number;
  readonly spin?: boolean;
  readonly class?: string;
  readonly style?: string;
  readonly title?: string;
}

/**
 * Render a VS Code codicon glyph.
 *
 * @example
 * <Icon name="rocket" size={24} />
 * <Icon name="loading" spin />
 */
export const Icon: FunctionalComponent<IconProps> = ({
  name,
  size = 14,
  spin = false,
  class: className,
  style,
  title,
}) => {
  const classes = ['codicon', `codicon-${name}`];
  if (spin) classes.push('codicon-modifier-spin');
  if (className) classes.push(className);

  return (
    <i
      class={classes.join(' ')}
      style={`font-size: ${size}px;${style ?? ''}`}
      title={title}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    />
  );
};
