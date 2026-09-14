import { DomainError } from '../../core/src/model.js';

export interface MdlNode {
  type: string; name: string; properties: Record<string, string[]>; tracks: Record<string, number[][]>;
  tables: Record<string, number[][]>;
}
export interface MdlAnimation {
  name: string; model: string; length: number; root: string;
  events: Array<{ time: number; name: string }>; nodes: MdlNode[];
}
export interface MdlReadback {
  model: string; classification: string; nodes: MdlNode[]; animations: MdlAnimation[];
}
const error = (message: string): never => { throw new DomainError('INVALID_FORMAT', `ASCII MDL: ${message}`); };
const finite = (value: string): number => {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) || !Number.isFinite(Number(value))) error(`Nieprawidłowa liczba: ${value}`);
  return Number(value);
};
export function numeric(node: MdlNode, property: string): number {
  const tokens = node.properties[property.toLowerCase()];
  if (!tokens || tokens.length !== 1) error(`Brak skalaru ${node.name}.${property}`);
  return finite(tokens[0]);
}
export function vector(node: MdlNode, property: string, size = 3): number[] {
  const tokens = node.properties[property.toLowerCase()];
  if (!tokens || tokens.length !== size) error(`Brak wektora ${node.name}.${property}`);
  return tokens.map(finite);
}
export function textProperty(node: MdlNode, property: string): string {
  const tokens = node.properties[property.toLowerCase()];
  if (!tokens || tokens.length !== 1) error(`Brak właściwości ${node.name}.${property}`);
  return tokens[0];
}

/** Structural reader independent of the writer. Original property tokens and
 * keyframes survive inspection. This is not an importer of arbitrary NWN MDL:
 * binary models and unsupported mesh/animation syntax fail explicitly.
 */
export function readAsciiMdl(input: Uint8Array | string, options: { requireAnimationOrder?: boolean; compiledTimeBounds?: boolean } = {}): MdlReadback {
  const source = typeof input === 'string' ? input : new TextDecoder('utf-8', { fatal: true }).decode(input);
  // 64 bounded custom-mesh layers can exceed the old emitter-only 8 MB cap.
  if (source.length > 128*1024*1024 || /[^\x09\x0a\x0d\x20-\x7e]/.test(source)) error('Oczekiwano ograniczonego formatu tekstowego ASCII.');
  const lines = source.split(/\r?\n/).map(line => line.replace(/#.*$/, '').trim()).filter(Boolean);
  let cursor = 0, model = '', classification = '', inGeometry = false, geometryFinished = false, finished = false;
  let animation: MdlAnimation | undefined;
  const nodes: MdlNode[] = [], animations: MdlAnimation[] = [];
  const requireTokens = (tokens: string[], min: number, max = min) => { if (tokens.length < min || tokens.length > max) error(`Nieprawidłowe pola: ${tokens.join(' ')}`); };
  const parseNode = (tokens: string[]): MdlNode => {
    requireTokens(tokens, 3);
    if (!['dummy', 'emitter', 'light', 'reference', 'trimesh', 'animmesh'].includes(tokens[1].toLowerCase())) error(`Nieobsługiwany typ w czytniku: ${tokens[1]}`);
    const node: MdlNode = { type: tokens[1].toLowerCase(), name: tokens[2], properties: {}, tracks: {}, tables: {} };
    let ended = false;
    while (cursor < lines.length) {
      const words = lines[cursor++].split(/\s+/), key = words[0].toLowerCase();
      if (key === 'endnode') { requireTokens(words, 1); ended = true; break; }
      if (['node', 'newanim', 'doneanim', 'donemodel', 'endmodelgeom'].includes(key)) error(`Brak endnode: ${node.name}`);
      if (['verts', 'tverts', 'faces', 'animverts', 'animtverts'].includes(key)) {
        requireTokens(words, 2);
        const sampled=key==='animverts'||key==='animtverts';
        if ((!['trimesh','animmesh'].includes(node.type)) || (animation&&node.type!=='animmesh') || (sampled&&(!animation||node.type!=='animmesh')) || Object.hasOwn(node.tables, key)) error(`Nieprawidłowa/powtórzona tabela: ${node.name}.${key}`);
        const count = finite(words[1]), width = key === 'faces' ? 8 : 3;
        if (!Number.isInteger(count) || count < 1 || count > (sampled?1_000_000:65535) || cursor + count > lines.length) error(`Nieprawidłowy rozmiar tabeli: ${key}`);
        const rows: number[][] = [];
        for (let index = 0; index < count; index++) {
          const row = lines[cursor++].split(/\s+/).map(finite);
          if (row.length !== width) error(`Nieprawidłowy wiersz tabeli: ${key}`);
          rows.push(row);
        }
        if (lines[cursor]?.toLowerCase() === 'endlist') cursor++;
        node.tables[key] = rows;
      } else if (key.endsWith('key')) {
        requireTokens(words, 1, 2);
        const field = key.slice(0, -3);
        if (Object.hasOwn(node.tracks, field)) error(`Powtórzona ścieżka: ${node.name}.${field}`);
        const count = words.length === 2 ? finite(words[1]) : undefined;
        if (count !== undefined && (!Number.isInteger(count) || count < 1 || count > 10000)) error('Nieprawidłowa liczba kluczy.');
        const rows: number[][] = [];
        let listEnded = false;
        while (cursor < lines.length) {
          if (lines[cursor].toLowerCase() === 'endlist') { cursor++; listEnded = true; break; }
          if (count !== undefined && rows.length === count) { listEnded = true; break; }
          const row = lines[cursor++].split(/\s+/).map(finite);
          if (row.length < 2 || (rows.length && row.length !== rows[0].length)) error('Nierówne wiersze ścieżki.');
          if (row[0] < 0 || (rows.length && row[0] <= rows[rows.length - 1][0])) error('Klucze muszą mieć rosnący czas.');
          rows.push(row);
        }
        if (!listEnded || !rows.length || (count !== undefined && count !== rows.length)) error('Niezgodna długość ścieżki.');
        const width = field === 'position' || field.startsWith('color') ? 4 : field === 'orientation' ? 5 : 2;
        if (rows.some(row => row.length !== width)) error(`Nieobsługiwany kształt ścieżki: ${field}`);
        node.tracks[field] = rows;
      } else {
        if (words.length < 2 || Object.hasOwn(node.properties, key)) error(`Nieprawidłowa/powtórzona właściwość: ${key}`);
        node.properties[key] = words.slice(1);
      }
    }
    if (!ended) error(`Nie zamknięto węzła: ${node.name}`);
    textProperty(node, 'parent');
    return node;
  };
  while (cursor < lines.length) {
    const tokens = lines[cursor++].split(/\s+/), key = tokens[0].toLowerCase();
    if (finished) error('Dane za donemodel.');
    switch (key) {
      case 'newmodel':
        requireTokens(tokens, 2); if (model) error('Drugi model.'); model = tokens[1]; break;
      case 'setsupermodel':
        requireTokens(tokens, 3); if (tokens[1] !== model || tokens[2].toUpperCase() !== 'NULL') error('Nieobsługiwany supermodel.'); break;
      case 'classification': requireTokens(tokens, 2); classification = tokens[1]; break;
      case 'setanimationscale': requireTokens(tokens, 2); if (finite(tokens[1]) !== 1) error('Nieobsługiwana skala animacji.'); break;
      case 'filedependancy': requireTokens(tokens, 2); break;
      case 'beginmodelgeom':
        requireTokens(tokens, 2); if (!model || tokens[1] !== model || inGeometry || geometryFinished || animation) error('Niewłaściwy początek geometrii.'); inGeometry = true; break;
      case 'endmodelgeom':
        requireTokens(tokens, 2); if (!inGeometry || tokens[1] !== model) error('Niewłaściwy koniec geometrii.'); inGeometry = false; geometryFinished = true; break;
      case 'node':
        if (!inGeometry && !animation) error('Węzeł poza geometrią/animacją.');
        (animation ? animation.nodes : nodes).push(parseNode(tokens)); break;
      case 'newanim':
        requireTokens(tokens, 3); if (!geometryFinished || inGeometry || animation || tokens[2] !== model) error('Niewłaściwy początek animacji.');
        animation = { name: tokens[1], model, length: -1, root: '', events: [], nodes: [] }; break;
      case 'length':
        requireTokens(tokens, 2); if (!animation || animation.length !== -1) error('Length poza animacją lub powtórzone.'); animation!.length = finite(tokens[1]); break;
      case 'transtime': requireTokens(tokens, 2); if (!animation || finite(tokens[1]) < 0) error('Nieprawidłowy transtime.'); break;
      case 'animroot': requireTokens(tokens, 2); if (!animation || animation.root) error('Nieprawidłowy animroot.'); animation!.root = tokens[1]; break;
      case 'event':
        requireTokens(tokens, 3); if (!animation) error('Zdarzenie poza animacją.'); animation!.events.push({ time: finite(tokens[1]), name: tokens[2] }); break;
      case 'doneanim':
        requireTokens(tokens, 2, 3);
        if (!animation || tokens[1] !== animation.name || (tokens.length === 3 && tokens[2] !== model)) error('Niezgodne doneanim.');
        animations.push(animation!); animation = undefined; break;
      case 'donemodel':
        requireTokens(tokens, 2); if (tokens[1] !== model || !geometryFinished || inGeometry || animation) error('Niezgodne donemodel.'); finished = true; break;
      default: error(`Nieobsługiwane polecenie: ${key}`);
    }
  }
  if (!finished || !nodes.length || !classification) error('Niekompletny model.');
  const names = new Map<string, MdlNode>();
  for (const node of nodes) {
    if (names.has(node.name)) error(`Powtórzony węzeł: ${node.name}`);
    names.set(node.name, node);
    if (node.type === 'trimesh'||node.type==='animmesh') {
      const { verts, tverts, faces } = node.tables;
      if (!verts?.length || !tverts?.length || !faces?.length) error(`Niekompletna geometria: ${node.name}`);
      for (const face of faces) {
        if (face.some(value => !Number.isInteger(value) || value < 0)
          || face.slice(0, 3).some(index => index >= verts.length)
          || face.slice(4, 7).some(index => index >= tverts.length)
          || new Set(face.slice(0, 3)).size !== 3) error(`Nieprawidłowe indeksy trójkąta: ${node.name}`);
        const [a, b, c] = face.slice(0, 3).map(index => verts[index]);
        const u = b.map((value, index) => value - a[index]), v = c.map((value, index) => value - a[index]);
        const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        if (Math.hypot(...cross) <= 1e-12 * Math.hypot(...u) * Math.hypot(...v)) error(`Zdegenerowany trójkąt: ${node.name}`);
      }
    }
  }
  if (!names.has(model) || textProperty(names.get(model)!, 'parent').toUpperCase() !== 'NULL') error('Brak korzenia modelu.');
  for (const node of nodes) {
    const visited = new Set<string>(); let current: MdlNode | undefined = node;
    while (current) {
      if (visited.has(current.name)) error('Cykl rodziców.');
      visited.add(current.name);
      const parent = textProperty(current, 'parent');
      if (parent.toUpperCase() === 'NULL') {
        if (current.name !== model) error('Drugi korzeń modelu.'); break;
      }
      current = names.get(parent);
      if (!current) error(`Nieznany rodzic: ${parent}`);
    }
  }
  const animationNames = new Set<string>();
  for (const anim of animations) {
    if (animationNames.has(anim.name) || anim.length < 0 || !names.has(anim.root)) error('Nieprawidłowa nazwa, długość lub korzeń animacji.');
    animationNames.add(anim.name);
    // The pinned decompiler prints length and key times with different precision.
    // Accept a textual overshoot only when both represent the SAME float32.
    // Source ASCII stays strict; neither input nor returned values are changed.
    const afterEnd=(time:number)=>time>anim.length&&!(options.compiledTimeBounds===true&&Math.fround(time)===Math.fround(anim.length));
    if (anim.events.some(event => event.time < 0 || afterEnd(event.time))) error('Zdarzenie poza czasem animacji.');
    const seen = new Set<string>(); let lastIndex = -1;
    for (const node of anim.nodes) {
      const geo = names.get(node.name), index = nodes.findIndex(n => n.name === node.name);
      // Native decompilers traverse animation children independently; the
      // source writer contract remains ordered unless explicitly inspecting
      // compiler output. Identity, uniqueness and parentage remain required.
      if (!geo || seen.has(node.name) || (options.requireAnimationOrder !== false && index <= lastIndex) || textProperty(geo, 'parent') !== textProperty(node, 'parent')) error('Niezgodna hierarchia lub kolejność animacji.');
      seen.add(node.name); lastIndex = index;
      if(node.type==='animmesh') {
        const {verts,tverts,animverts,animtverts}=node.tables;
        if(!verts?.length||!tverts?.length||!animverts?.length||!animtverts?.length||animverts.length%verts.length||animtverts.length%tverts.length||animverts.length/verts.length!==animtverts.length/tverts.length||numeric(node,'sampleperiod')<=0)error('Nieprawidłowe zestawy animmesh.');
      }
      for (const rows of Object.values(node.tracks)) if (rows.some(row => afterEnd(row[0]))) error('Klucz poza czasem animacji.');
    }
  }
  return { model, classification, nodes, animations };
}

/** Evaluates serialized linear keys, useful for validating the global detonate schedule. */
export function sampleTrack(rows: number[][], time: number): number[] {
  if (!rows.length) error('Pusta ścieżka.');
  if (time <= rows[0][0]) return rows[0].slice(1);
  for (let i = 1; i < rows.length; i++) if (time <= rows[i][0]) {
    const left = rows[i - 1], right = rows[i], factor = (time - left[0]) / (right[0] - left[0]);
    return left.slice(1).map((value, column) => value + (right[column + 1] - value) * factor);
  }
  return rows[rows.length - 1].slice(1);
}
