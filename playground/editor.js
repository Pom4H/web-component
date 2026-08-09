const lineStartAt = (value, position) => position === 0 ? 0 : value.lastIndexOf('\n', position - 1) + 1;

const leadingRemoval = (value, lineStart, indentSize) => {
  if (value[lineStart] === '\t') return 1;
  let count = 0;
  while (count < indentSize && value[lineStart + count] === ' ') count++;
  return count;
};

const applyEdits = (value, edits) => {
  let output = value;
  for (let index = edits.length - 1; index >= 0; index--) {
    const edit = edits[index];
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  return output;
};

const mapPosition = (position, edits) => {
  let delta = 0;
  for (const edit of edits) {
    if (position < edit.start) break;
    if (position <= edit.end) {
      if (edit.start === edit.end) return edit.start + delta + edit.text.length;
      return edit.start + delta + Math.min(Math.max(0, position - edit.start), edit.text.length);
    }
    delta += edit.text.length - (edit.end - edit.start);
  }
  return position + delta;
};

export function indentSelection(value, selectionStart, selectionEnd, outdent = false, indent = '  ') {
  if (selectionStart === selectionEnd && !outdent) {
    const output = value.slice(0, selectionStart) + indent + value.slice(selectionEnd);
    const position = selectionStart + indent.length;
    return { value: output, start: position, end: position };
  }

  const firstLineStart = lineStartAt(value, selectionStart);
  let target = selectionEnd;
  if (selectionEnd > selectionStart && value[selectionEnd - 1] === '\n') target--;
  const lastLineStart = lineStartAt(value, target);
  const lineStarts = [firstLineStart];

  for (let cursor = value.indexOf('\n', firstLineStart); cursor !== -1 && cursor < lastLineStart; cursor = value.indexOf('\n', cursor + 1)) {
    lineStarts.push(cursor + 1);
  }

  const edits = lineStarts.map(start => {
    if (!outdent) return { start, end: start, text: indent };
    const count = leadingRemoval(value, start, indent.length);
    return { start, end: start + count, text: '' };
  }).filter(edit => edit.start !== edit.end || edit.text);

  if (!edits.length) return { value, start: selectionStart, end: selectionEnd };

  return {
    value: applyEdits(value, edits),
    start: mapPosition(selectionStart, edits),
    end: mapPosition(selectionEnd, edits)
  };
}

export function insertIndentedNewline(value, selectionStart, selectionEnd) {
  const lineStart = lineStartAt(value, selectionStart);
  const indent = value.slice(lineStart, selectionStart).match(/^[\t ]*/)?.[0] || '';
  const inserted = `\n${indent}`;
  const position = selectionStart + inserted.length;
  return {
    value: value.slice(0, selectionStart) + inserted + value.slice(selectionEnd),
    start: position,
    end: position
  };
}

export function cursorLabel(value, selectionStart, selectionEnd) {
  const line = value.slice(0, selectionEnd).split('\n').length;
  const previousNewline = selectionEnd === 0 ? -1 : value.lastIndexOf('\n', selectionEnd - 1);
  const column = selectionEnd - previousNewline;
  const selected = selectionEnd - selectionStart;
  return `Ln ${line}, Col ${column}${selected ? ` · ${selected} selected` : ''}`;
}
