import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = ['runtime/reactive.js', 'runtime/template.js', 'runtime/component.js', 'skein.js'];

const internalNames = {
  Scope:'S', Scheduler:'Q', ComputedRef:'C', ReactiveEffect:'E', ReactiveState:'R', BindingScope:'B', CompiledTemplate:'T', SkeinElement:'W', CodeLoader:'L', CompiledComponent:'K', ListPart:'I', BranchPart:'H', View:'V', Ref:'F', Dep:'D',
  unwrap:'uw', raw:'rw', toText:'tx', owns:'ow', read:'rd', follow:'fl', exact:'ex', AsyncFunction:'AF', scriptCache:'SC', bootstrap:'bs', ITERATE:'_i', MISS:'_m', DYNAMIC:'_d', INITIAL:'_n', TEXT:'_0', ATTR:'_1', BOOL:'_2', PROP:'_3', EVENT:'_4', LIST:'_5', BRANCH:'_6', clearDependencies:'cd', compilePath:'cp', loadElement:'le', defineSkeinElement:'de', registerComponent:'dc', parseTokens:'pt', moveNodesBefore:'mv', keyFromItem:'ki', bindText:'bt', bindAttribute:'ba', bindBoolean:'bb', bindProperty:'bp', bindEvent:'be', byPath:'np', watch:'ww', render:'rn', reactiveTarget:'rt', reactive:'rx', dep:'dp',
  activeObserver:'$a', subscribers:'$b', dependencies:'$c', renderQueue:'$d', effectQueue:'$e', pending:'$f', flushing:'$g', callback:'$h', current:'$i', dirty:'$j', disposed:'$k', cached:'$l', scope:'$m', children:'$n', owned:'$o', paused:'$q', controller:'$r', parent:'$s', contextValue:'$t', locals:'$v', bindingScope:'$y', owner:'$z', instruction:'$A', records:'$B', order:'$C', expression:'$D', keyPath:'$E', view:'$G', visible:'$H', fragment:'$I', instructions:'$K', customPaths:'$L', scripts:'$N', cache:'$O', parser:'$P', mounting:'$R', previous:'$U', structural:'$V', previousLength:'$W', target:'$X', receiver:'$Y', property:'$Z', proxy:'$_a', tokenList:'$_b', pathExpression:'$_d', templateNode:'$_e', indexRef:'$_f', itemScope:'$_g',
  value:'b', node:'c', path:'d', index:'e', name:'f', child:'h', nodes:'i', type:'j', element:'k', existing:'l', record:'m', anchor:'n', end:'o', key:'p', result:'s', computed:'t', effect:'u', onCleanup:'v', abortSignal:'w', host:'x', input:'$49', inputs:'$50', acceptInput:'$51', start:'y', head:'z', source:'A', tag:'J', item:'L', occurrence:'M', response:'N', event:'P', lookup:'aa', context:'ab', tokens:'ac', component:'ad', hit:'af', last:'ah', active:'ai', cleanup:'aj', notify:'ak', track:'$0', invalidate:'$1', run:'$2', request:'$3', flush:'$4', compute:'$5', reactiveTargetCheck:'$6', mount:'$10', runScript:'$11', report:'$12', compileChildren:'$13', instantiate:'$14', fromNode:'$15', update:'$16', pause:'$17', resume:'$18', own:'$20', setContext:'$21', register:'$22', load:'$23', compile:'$24', signal:'$25', collection:'$26', script:'$27', template:'$F', observer:'$28', parts:'$29', token:'$30', next:'$31', occurrences:'$32', deps:'$33', proxies:'$34', enqueue:'$35', root:'$36', items:'$37', handler:'$38', eachPath:'$39', ifPath:'$40', parentPath:'$42', subscriber:'$44', mutable:'$45', listener:'$47', baseURL:'$48', rawValues:'$52', dependency:'$53', eachValue:'$55', keyValue:'$56', ifValue:'$57', dynamic:'$58', elements:'$59', nextValue:'$60', disposeElement:'$61', keys:'$62', fallback:'$63', initial:'$64', had:'$65'
};

const identifierStart = char => /[A-Za-z_$]/.test(char);
const identifierPart = char => /[A-Za-z0-9_$]/.test(char);
const regexPrefix = new Set(['=', '(', ',', '[', ':', 'return', '=>']);
const operators = ['===','!==','>>>','**=','=>','?.','??','&&','||','++','--','==','!=','<=','>=','**','...','||=','&&=','??=','+=','-=','*=','/=','%=','<<','>>'];

function stripModules(source) {
  return source
    .replace(/^import\s+[^;]+;\s*$/gm, '')
    .replace(/\bexport\s+(?=(?:class|const|let|var|function)\b)/g, '');
}

function minify(source) {
  const out = [];
  let index = 0;
  let previousType = '';
  let previous = '';

  const push = (token, type) => {
    if ((previousType === 'word' || previousType === 'number') && (type === 'word' || type === 'number')) out.push(' ');
    else if ((previous.endsWith('+') && token.startsWith('+')) || (previous.endsWith('-') && token.startsWith('-'))) out.push(' ');
    out.push(token);
    previous = token;
    previousType = type;
  };

  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) { index++; continue; }

    if (source.startsWith('//', index)) {
      const end = source.indexOf('\n', index + 2);
      index = end < 0 ? source.length : end + 1;
      continue;
    }
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      index = end < 0 ? source.length : end + 2;
      continue;
    }

    if (char === "'" || char === '"') {
      const quote = char;
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === '\\') { end += 2; continue; }
        if (source[end] === quote) { end++; break; }
        end++;
      }
      push(source.slice(index, end), 'string');
      index = end;
      continue;
    }

    if (char === '`') {
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === '\\') { end += 2; continue; }
        if (source[end] === '`') { end++; break; }
        end++;
      }
      push(source.slice(index, end), 'string');
      index = end;
      continue;
    }

    if (identifierStart(char)) {
      let end = index + 1;
      while (end < source.length && identifierPart(source[end])) end++;
      const word = source.slice(index, end);
      push(Object.hasOwn(internalNames, word) ? internalNames[word] : word, 'word');
      index = end;
      continue;
    }

    if (/[0-9]/.test(char)) {
      let end = index + 1;
      while (end < source.length && /[A-Za-z0-9._]/.test(source[end])) end++;
      push(source.slice(index, end), 'number');
      index = end;
      continue;
    }

    if (char === '/' && source[index + 1] !== '/' && source[index + 1] !== '*' && regexPrefix.has(previous)) {
      let end = index + 1;
      let inClass = false;
      while (end < source.length) {
        if (source[end] === '\\') { end += 2; continue; }
        if (source[end] === '[') inClass = true;
        else if (source[end] === ']') inClass = false;
        else if (source[end] === '/' && !inClass) {
          end++;
          while (/[A-Za-z]/.test(source[end] || '')) end++;
          break;
        }
        end++;
      }
      push(source.slice(index, end), 'regex');
      index = end;
      continue;
    }

    let operator = operators.find(value => source.startsWith(value, index));
    if (!operator) operator = char;
    push(operator, 'punct');
    index += operator.length;
  }

  return out.join('');
}

const source = (await Promise.all(files.map(file => readFile(join(root, file), 'utf8'))))
  .map(stripModules)
  .join('\n');
const output = minify(source) + 'export{Skein};\n';
const target = join(root, 'skein.min.js');

if (process.argv.includes('--check')) {
  const existing = await readFile(target, 'utf8').catch(() => '');
  if (existing !== output) {
    console.error('skein.min.js is stale. Run: node tools/build.mjs');
    process.exit(1);
  }
} else {
  await writeFile(target, output);
}

const bytes = Buffer.byteLength(output);
const gzip = gzipSync(output, { level: 9 }).length;
const brotli = brotliCompressSync(output, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
console.log(`skein.min.js  raw ${bytes} B  gzip ${gzip} B  brotli ${brotli} B`);
