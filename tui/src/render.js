const ESC = '\x1b[';
const RESET = `${ESC}0m`;
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const ITALIC = `${ESC}3m`;

// True-color mustard palette
const MUSTARD = `${ESC}38;2;225;173;1m`;
const MUSTARD_DIM = `${ESC}38;2;140;108;1m`;

const fg = {
  mustard: (s) => `${MUSTARD}${s}${RESET}`,
  mustardBold: (s) => `${BOLD}${MUSTARD}${s}${RESET}`,
  mustardDim: (s) => `${MUSTARD_DIM}${s}${RESET}`,
  white: (s) => `${ESC}37m${s}${RESET}`,
  gray: (s) => `${ESC}90m${s}${RESET}`,
  green: (s) => `${ESC}32m${s}${RESET}`,
  red: (s) => `${ESC}31m${s}${RESET}`,
  yellow: (s) => `${ESC}33m${s}${RESET}`,
  cyan: (s) => `${ESC}36m${s}${RESET}`,
  magenta: (s) => `${ESC}35m${s}${RESET}`,
  blue: (s) => `${ESC}34m${s}${RESET}`,
  brightYellow: (s) => `${ESC}93m${s}${RESET}`,
  brightGreen: (s) => `${ESC}92m${s}${RESET}`,
  brightCyan: (s) => `${ESC}96m${s}${RESET}`,
  brightMagenta: (s) => `${ESC}95m${s}${RESET}`,
  brightBlue: (s) => `${ESC}94m${s}${RESET}`,
};

const bold = (s) => `${BOLD}${s}${RESET}`;
const dim = (s) => `${DIM}${s}${RESET}`;

// ── Tabs ────────────────────────────────────────────────────────────────

export const TABS = [
  { key: 'todo', label: 'Todos', icon: '☐' },
  { key: 'people_note', label: 'People', icon: '●' },
  { key: 'idea', label: 'Ideas', icon: '✧' },
  { key: 'daily_log', label: 'Logs', icon: '◉' },
  { key: 'project', label: 'Projects', icon: '◈' },
  { key: 'learning', label: 'Learnings', icon: '◆' },
];

const tabColors = {
  todo: fg.brightYellow,
  people_note: fg.brightCyan,
  idea: fg.brightMagenta,
  daily_log: fg.brightGreen,
  project: fg.brightBlue,
  learning: fg.cyan,
};

// ── Logo ────────────────────────────────────────────────────────────────

const LOGO = [
  '███╗   ███╗██╗   ██╗███████╗████████╗ █████╗ ██████╗ ██████╗ ',
  '████╗ ████║██║   ██║██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██╔══██╗',
  '██╔████╔██║██║   ██║███████╗   ██║   ███████║██████╔╝██║  ██║',
  '██║╚██╔╝██║██║   ██║╚════██║   ██║   ██╔══██║██╔══██╗██║  ██║',
  '██║ ╚═╝ ██║╚██████╔╝███████║   ██║   ██║  ██║██║  ██║██████╔╝',
  '╚═╝     ╚═╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ',
];

// ── Terminal helpers ────────────────────────────────────────────────────

export function clearScreen() {
  process.stdout.write(`${ESC}2J${ESC}H`);
}

export function hideCursor() {
  process.stdout.write(`${ESC}?25l`);
}

export function showCursor() {
  process.stdout.write(`${ESC}?25h`);
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function centerPad(text, width) {
  const len = stripAnsi(text).length;
  const left = Math.max(0, Math.floor((width - len) / 2));
  return ' '.repeat(left) + text;
}

function truncate(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return dateStr;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${months[d.getMonth()]} ${d.getDate().toString().padStart(2)}`;
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  const today = new Date();
  const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return dateStr < local;
}

function isDueToday(dateStr) {
  if (!dateStr) return false;
  const today = new Date();
  const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return dateStr === local;
}

function todoGroup(record) {
  if (record.due_date && isDueToday(record.due_date)) return 0;
  if (record.due_date && isOverdue(record.due_date)) return 1;
  return 2;
}

// ── Layout constants ────────────────────────────────────────────────────

const HEADER_LINES = 12; // blank + 6 logo + subtitle + blank + tabs + sep + count
const FOOTER_LINES = 3; // blank + footer + blank

export function getViewportHeight() {
  const rows = process.stdout.rows || 24;
  return Math.max(5, rows - HEADER_LINES - FOOTER_LINES);
}

// ── Main render ─────────────────────────────────────────────────────────

export function render(state, records) {
  const { tabIndex, itemIndex, scrollOffset, detailMode } = state;
  const cols = Math.min(process.stdout.columns || 80, 100);
  const rows = process.stdout.rows || 24;
  const tab = TABS[tabIndex];
  const items = records;
  const lines = [];

  // Logo
  lines.push('');
  for (const logoLine of LOGO) {
    lines.push(centerPad(fg.mustardBold(logoLine), cols));
  }
  lines.push(centerPad(fg.mustardDim('personal knowledge store'), cols));
  lines.push('');

  // Tab bar
  const tabsLine = TABS.map((t, i) => {
    const color = tabColors[t.key] || fg.white;
    if (i === tabIndex) return bold(color(`▸ ${t.icon} ${t.label}`));
    return dim(`  ${t.icon} ${t.label}`);
  }).join('   ');
  lines.push('  ' + tabsLine);
  lines.push('  ' + fg.mustardDim('─'.repeat(Math.min(cols - 4, 80))));

  // Record count
  const countStr = detailMode
    ? `${itemIndex + 1}/${items.length} records`
    : `${items.length} records`;
  lines.push('  ' + fg.gray(countStr));

  if (state.expandText && items[itemIndex]) {
    renderExpandedText(lines, items[itemIndex], tab.key, cols, rows - lines.length - FOOTER_LINES, state.textScroll);
  } else if (detailMode && items[itemIndex]) {
    renderDetail(lines, items[itemIndex], tab.key, cols, rows - lines.length - FOOTER_LINES);
  } else {
    renderList(lines, items, itemIndex, scrollOffset, tab.key, cols);
  }

  // Footer
  lines.push('');
  if (state.expandText) {
    lines.push(
      '  ' + dim('↑↓') + fg.gray(' scroll') +
      '  ' + dim('esc') + fg.gray(' back') +
      '  ' + dim('q') + fg.gray(' quit'),
    );
  } else if (detailMode) {
    lines.push(
      '  ' + dim('enter') + fg.gray(' full text') +
      '  ' + dim('esc') + fg.gray(' back') +
      '  ' + dim('←→') + fg.gray(' tabs') +
      '  ' + dim('q') + fg.gray(' quit'),
    );
  } else {
    lines.push(
      '  ' + dim('←→') + fg.gray(' tabs') +
      '  ' + dim('↑↓') + fg.gray(' navigate') +
      '  ' + dim('enter') + fg.gray(' details') +
      '  ' + dim('r') + fg.gray(' refresh') +
      '  ' + dim('q') + fg.gray(' quit'),
    );
  }
  lines.push('');

  clearScreen();
  process.stdout.write(lines.join('\n'));
}

// ── List view ───────────────────────────────────────────────────────────

function renderList(lines, records, itemIndex, scrollOffset, tabKey, cols) {
  const viewHeight = getViewportHeight();
  const visible = records.slice(scrollOffset, scrollOffset + viewHeight);
  const color = tabColors[tabKey] || fg.white;

  lines.push('');

  if (records.length === 0) {
    lines.push('    ' + fg.gray('No records'));
    return;
  }

  // Pre-compute group labels for todo tab
  const GROUP_LABELS = { 0: 'TODAY', 1: 'OVERDUE', 2: 'BACKLOG' };
  const GROUP_COLORS = { 0: fg.green, 1: fg.red, 2: fg.gray };
  let groupLabelAt = {};
  if (tabKey === 'todo' && visible.length > 0) {
    let prevGroup = scrollOffset > 0 ? todoGroup(records[scrollOffset - 1]) : -1;
    for (let i = 0; i < visible.length; i++) {
      const g = todoGroup(visible[i]);
      if (g !== prevGroup) {
        groupLabelAt[i] = g;
      }
      prevGroup = g;
    }
  }

  for (let i = 0; i < visible.length; i++) {
    // Insert group label header for todo groups
    if (i in groupLabelAt) {
      const g = groupLabelAt[i];
      const label = GROUP_LABELS[g];
      const colorFn = GROUP_COLORS[g];
      const dash = '─';
      const tag = ` ${label} `;
      const lineWidth = cols - 8; // 4 indent + 4 margin
      const after = Math.max(0, lineWidth - tag.length - 2);
      lines.push('    ' + colorFn(`${dash.repeat(2)}${tag}${dash.repeat(after)}`));
    }

    const record = visible[i];
    const realIndex = scrollOffset + i;
    const isSelected = realIndex === itemIndex;
    const pointer = isSelected ? fg.mustard('  ▸ ') : '    ';

    // Left badge
    let badge = '';
    let badgeLen = 0;

    switch (tabKey) {
      case 'todo': {
        const dot =
          record.status === 'done'
            ? fg.gray('◌')
            : record.due_date && isOverdue(record.due_date)
              ? fg.red('●')
              : fg.green('●');
        badge = dot + ' ';
        badgeLen = 2;
        break;
      }
      case 'people_note': {
        const person = truncate(record.person || '—', 10);
        badge = fg.cyan(person.padEnd(10)) + '  ';
        badgeLen = 12;
        break;
      }
      case 'idea': {
        const dot =
          record.status === 'exploring'
            ? fg.yellow('◎')
            : record.status === 'captured'
              ? fg.gray('◌')
              : fg.magenta('●');
        badge = dot + ' ';
        badgeLen = 2;
        break;
      }
      case 'daily_log': {
        const theme = truncate(record.theme || record.period || '', 10);
        if (theme) {
          badge = fg.green(theme.padEnd(10)) + '  ';
          badgeLen = 12;
        }
        break;
      }
      case 'learning': {
        const dot =
          record.status === 'processed'
            ? fg.cyan('◎')
            : record.status === 'applied'
              ? fg.green('◌')
              : fg.yellow('●');
        badge = dot + ' ';
        badgeLen = 2;
        break;
      }
    }

    // Right metadata — fixed-width columns for alignment
    const DATE_COL = 6; // "Mar 31"
    const rightLen = 2 + DATE_COL; // gap + date

    let dateStr;
    if (tabKey === 'todo') {
      const due = record.due_date ? formatDate(record.due_date) : '—';
      const dueColor = record.due_date && isOverdue(record.due_date) ? fg.red : fg.gray;
      dateStr = dueColor(due.padStart(DATE_COL));
    } else {
      dateStr = fg.gray(formatDate(record.capture_date).padStart(DATE_COL));
    }

    // Title
    const title =
      record.title ||
      record.text?.replace(/\n/g, ' ')?.slice(0, 100) ||
      record.id.slice(0, 8);
    const availWidth = cols - 4 - badgeLen - rightLen;
    const displayTitle = truncate(title, Math.max(20, availWidth));
    const titlePad = Math.max(0, availWidth - displayTitle.length);

    const isDone = tabKey === 'todo' && record.status === 'done';
    const isBacklog = tabKey === 'todo' && todoGroup(record) === 2;
    let titleStr;
    if (isSelected) {
      titleStr = bold(color(displayTitle));
    } else if (isDone || isBacklog) {
      titleStr = fg.gray(displayTitle);
    } else {
      titleStr = fg.white(displayTitle);
    }

    // Mute badge and date for backlog todos (unless selected)
    if (isBacklog && !isSelected) {
      badge = fg.gray('●') + ' ';
      dateStr = fg.gray(dateStr.replace(/\x1b\[[0-9;]*m/g, ''));
    }

    lines.push(`${pointer}${badge}${titleStr}${' '.repeat(titlePad)}  ${dateStr}`);
  }

  // Scroll indicators
  if (records.length > viewHeight) {
    const up = scrollOffset > 0 ? '↑' : ' ';
    const down = scrollOffset + viewHeight < records.length ? '↓' : ' ';
    const range = `${scrollOffset + 1}–${Math.min(scrollOffset + viewHeight, records.length)}`;
    lines.push('    ' + fg.gray(`${up} ${range} of ${records.length} ${down}`));
  }
}

// ── Detail view ─────────────────────────────────────────────────────────

function renderDetail(lines, record, tabKey, cols, availRows) {
  const color = tabColors[tabKey] || fg.white;
  const contentWidth = Math.min(cols - 6, 80);

  lines.push('');
  lines.push('  ' + fg.mustardDim('─'.repeat(contentWidth)));
  lines.push('');

  // Title
  const title = record.title || record.id.slice(0, 8);
  lines.push('  ' + bold(color(title)));
  lines.push('');

  // Text content (wrapped)
  if (record.text) {
    const textLines = wrapText(record.text, contentWidth);
    const maxTextLines = Math.max(5, availRows - 14);
    for (let i = 0; i < Math.min(textLines.length, maxTextLines); i++) {
      lines.push('  ' + fg.white(textLines[i]));
    }
    if (textLines.length > maxTextLines) {
      lines.push('  ' + fg.gray(`… ${textLines.length - maxTextLines} more lines — press enter for full text`));
    }
    lines.push('');
  }

  // Metadata
  lines.push('  ' + fg.mustardDim('─'.repeat(contentWidth)));

  const tags = (() => {
    try {
      const t = JSON.parse(record.tags || '[]');
      return t.length ? t.join(', ') : null;
    } catch {
      return null;
    }
  })();

  const fields = [
    ['type', record.log_type],
    ['status', record.status],
    [
      'due',
      record.due_date
        ? formatDate(record.due_date) +
          (isOverdue(record.due_date) && record.status !== 'done'
            ? ' (overdue)'
            : '')
        : null,
    ],
    ['person', record.person],
    ['category', record.category],
    ['theme', record.theme],
    ['period', record.period],
    ['delegate', record.delegate],
    ['captured', formatDate(record.capture_date)],
    ['tags', tags],
    ['source', record.source_url],
    ['id', record.id],
  ].filter(([, v]) => v);

  const half = Math.ceil(fields.length / 2);
  for (let i = 0; i < half; i++) {
    const [lk, lv] = fields[i];
    let line = '  ' + dim(lk.padEnd(10)) + ' ' + fg.white(truncate(String(lv), 28));
    const right = fields[i + half];
    if (right) {
      const [rk, rv] = right;
      line += '   ' + dim(rk.padEnd(10)) + ' ' + fg.white(truncate(String(rv), 28));
    }
    lines.push(line);
  }
}

// ── Expanded text view ──────────────────────────────────────────────────

function renderExpandedText(lines, record, tabKey, cols, availRows, textScroll) {
  const color = tabColors[tabKey] || fg.white;
  const contentWidth = Math.min(cols - 6, 80);

  lines.push('');

  // Title
  const title = record.title || record.id.slice(0, 8);
  lines.push('  ' + bold(color(title)));
  lines.push('  ' + fg.mustardDim('─'.repeat(contentWidth)));
  lines.push('');

  if (!record.text) {
    lines.push('    ' + fg.gray('No text content'));
    return;
  }

  const textLines = wrapText(record.text, contentWidth);
  const viewHeight = Math.max(3, availRows - 5);
  const maxScroll = Math.max(0, textLines.length - viewHeight);
  const scroll = Math.min(textScroll, maxScroll);
  const visible = textLines.slice(scroll, scroll + viewHeight);

  for (const line of visible) {
    lines.push('  ' + fg.white(line));
  }

  // Scroll position indicator
  if (textLines.length > viewHeight) {
    const up = scroll > 0 ? '↑' : ' ';
    const down = scroll + viewHeight < textLines.length ? '↓' : ' ';
    lines.push('');
    lines.push('    ' + fg.gray(`${up} line ${scroll + 1}–${Math.min(scroll + viewHeight, textLines.length)} of ${textLines.length} ${down}`));
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function wrapText(text, width) {
  const result = [];
  for (const rawLine of text.split('\n')) {
    if (rawLine.length <= width) {
      result.push(rawLine);
      continue;
    }
    let remaining = rawLine;
    while (remaining.length > width) {
      let breakAt = remaining.lastIndexOf(' ', width);
      if (breakAt <= 0) breakAt = width;
      result.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).trimStart();
    }
    if (remaining) result.push(remaining);
  }
  return result;
}
