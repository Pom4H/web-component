const escapeHTML = value => value.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
const keywords = new Set(['const','let','var','this','return','if','else','for','while','new','class','extends','async','await','function','true','false','null','undefined','typeof','instanceof','import','from','export','default','try','catch','throw']);

const span = (kind, value) => `<span class="tok-${kind}">${escapeHTML(value)}</span>`;

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
      const escaped = escapeHTML(raw)
        .replace(/^(&lt;\/?)([\w-]+)/, '$1<span class="tok-tag">$2</span>')
        .replace(/([\s])([:@?.]?[\w-]+)(?==)/g, '$1<span class="tok-attr">$2</span>')
        .replace(/\{([^{}]+)\}/g, '<span class="tok-bind">{$1}</span>');
      out += escaped; i += raw.length; continue;
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
