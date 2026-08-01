import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'ptf-bg':        '#0A0B0D',
        'ptf-surface':   '#111318',
        'ptf-elevated':  '#1A1D24',
        'ptf-border':    '#2A2D36',
        'ptf-muted':     '#3A3D48',
        'ptf-text':      '#E8EAF0',
        'ptf-text-2':    '#9095A8',
        'ptf-text-3':    '#5A5F72',
        'ptf-accent':    '#7C3AED',
        'ptf-accent-h':  '#6D28D9',
        'ptf-accent-l':  '#8B5CF6',
        'rep-unranked':  '#6B7280',
        'rep-junior':    '#3B82F6',
        'rep-senior':    '#8B5CF6',
        'rep-expert':    '#F59E0B',
        'status-open':       '#22C55E',
        'status-claimed':    '#3B82F6',
        'status-progress':   '#8B5CF6',
        'status-submitted':  '#F59E0B',
        'status-review':     '#F97316',
        'status-validated':  '#10B981',
        'status-rejected':   '#EF4444',
        'status-disputed':   '#F59E0B',
        'status-expired':    '#6B7280',
        'status-blocked':    '#DC2626',
        'priority-critical': '#DC2626',
        'priority-high':     '#F97316',
        'priority-medium':   '#F59E0B',
        'priority-low':      '#6B7280',
        'ptf-success':   '#10B981',
        'ptf-warning':   '#F59E0B',
        'ptf-error':     '#EF4444',
        'ptf-info':      '#3B82F6',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'countdown-urgent': 'pulse 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
