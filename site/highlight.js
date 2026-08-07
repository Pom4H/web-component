const escapeHTML = value => value.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
const keywords = new Set(['const','let','var','this','return','if','else','for','while','new','class','extends','async','await','function','true','false','null','undefined','typeof','instanceof','import','from','export','default','try','catch','throw']);

const span = (kind, value) => `<span class="tok-${kind}">${escapeHTML(value)}</span>`;

const highlightTag = raw => {
  const marks = [];
  const mark = (kind, value) => {
    const index = marks.push(span(kind, value)) - 1;
    return `\u0000${index}\u0000`;
  };

  let escaped = escapeHTML(raw)
    .replace(/^(&lt;\/?)([\w-]+)/, (_, prefix, name) => `${prefix}${mark('tag', name)}`)
    .replace(/([\s])([:@?.]?[\w-]+)(?==)/g, (_, space, name) => `${space}${mark('attr', name)}`)
    .replace(/\{([^{}]+)\}/g, value => mark('bind', value));

  return escaped.replace(/\u0000(\d+)\u0000/g, (_, index) => marks[Number(index)]);
};

export function highlight(source) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    let match;
    if ((match = rest.match(/^<!--[\s\S]*?-->/))) { out += span('comment', match[0]); i += match[0].length; continue; }
    if ((match = rest.match(/^\/\*[\s\S]*?\*\//))) { out += span('comment', match[0]); i += match[0].length; continue; }
    if ((match = rest.match(/^\/\/[^\n]*/))) { out += span('comment', match[0]); i += match[0].length; continue; }
    if ((match = rest.match(/^(['"`])(?:\\.|(?!\1)[\s\S])*?\1/))) { out += span('string', match[0]); i += match[0].length; continue; }
    if ((match = rest.match(/^<\/?[A-Za-z][^>]*>/))) {
      const raw = match[0];
      out += highlightTag(raw);
      i += raw.length;
      continue;
    }
    if ((match = rest.match(/^\{[^{}\n]+\}/))) { out += span('bind', match[0]); i += match[0].length; continue; }
    if ((match = rest.match(/^\b\d+(?:\.\d+)?\b/))) { out += span('number', match[0]); i += match[0].length; continue; }
    if ((match = rest.match(/^[A-Za-z_$][\w$]*/))) {
      out += keywords.has(match[0]) ? span('keyword', match[0]) : escapeHTML(match[0]);
      i += match[0].length; continue;
    }
    out += escapeHTML(source[i]); i++;
  }
  return out + (source.endsWith('\n') ? ' ' : '');
}
