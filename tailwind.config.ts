import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--ef-paper)',
        panel: 'var(--ef-panel)',
        ink: 'var(--ef-ink)',
        'ink-2': 'var(--ef-ink-2)',
        rule: 'var(--ef-rule)',
        chip: 'var(--ef-chip)',
        signal: 'var(--ef-signal)',
        danger: 'var(--ef-danger)',
        /* 旧键保留：值指向新 token，避免遗留类名失效 */
        'bg-0': 'var(--bg-0)',
        'bg-1': 'var(--bg-1)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        'surface-4': 'var(--surface-4)',
        'swatch-bed': 'var(--swatch-bed)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        accent: 'var(--accent)',
        'accent-dim': 'var(--accent-dim)',
        'accent-ink': 'var(--accent-ink)',
        'text-1': 'var(--text-1)',
        'text-2': 'var(--text-2)',
        'text-3': 'var(--text-3)',
        'text-inv': 'var(--text-inv)',
        ok: 'var(--ok)',
        warn: 'var(--warn)',
        'bh-red': 'var(--bh-red)',
        'bh-blue': 'var(--bh-blue)',
        'bh-yellow': 'var(--bh-yellow)',
        ghost: 'var(--ghost)',
      },
      fontFamily: {
        display: 'var(--ef-font-ui)',
        body: 'var(--ef-font-text)',
        mono: 'var(--ef-font-mono)',
      },
      borderRadius: {
        card: '0px',
        tag: '0px',
        dot: '0px',
      },
      height: {
        topbar: 'var(--ef-status-h)',
        row: 'var(--row)',
        'row-compact': 'var(--row-compact)',
        cmd: 'var(--ef-cmd-h)',
      },
      width: {
        sidenav: '0px',
        tile: 'var(--tile-w)',
      },
      minWidth: {
        sidenav: '0px',
      },
      maxWidth: {
        shell: '1600px',
      },
      transitionDuration: {
        hover: '200ms',
        panel: '280ms',
        liquid: '450ms',
      },
    },
  },
  plugins: [],
} satisfies Config;
