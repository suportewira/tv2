// Monta a pasta _site (o que vai para o GitHub Pages) e gera playlist.json
// com os vídeos da pasta "videos". Roda sozinho no GitHub a cada publicação;
// também dá para rodar no computador: node scripts/montar-site.mjs
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = join(RAIZ, '_site');
const PASTA_VIDEOS = 'videos';
const EXTENSOES = new Set(['.mp4', '.m4v', '.webm', '.mov', '.ogv']);
const ARQUIVOS_SITE = ['index.html', 'app.js', 'sw.js', 'manifest.webmanifest', 'icon.svg'];
const LIMITE_SITE = 1024 ** 3; // o GitHub Pages aceita sites de até 1 GB

const hashDe = (conteudo) => createHash('sha256').update(conteudo).digest('hex');
const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

rmSync(SAIDA, { recursive: true, force: true });
mkdirSync(join(SAIDA, PASTA_VIDEOS), { recursive: true });

// Arquivos do site. O hash deles avisa as TVs quando o código do site muda:
// vai carimbado no app.js (VERSAO_APP) e no playlist.json (app).
const hashSite = createHash('sha256');
for (const arquivo of ARQUIVOS_SITE) {
  hashSite.update(arquivo).update(readFileSync(join(RAIZ, arquivo)));
}
const versaoApp = hashSite.digest('hex').slice(0, 12);
for (const arquivo of ARQUIVOS_SITE) {
  let conteudo = readFileSync(join(RAIZ, arquivo), 'utf8');
  if (arquivo === 'app.js') conteudo = conteudo.replace("'__VERSAO_APP__'", `'${versaoApp}'`);
  // ?v= evita que a TV use um app.js velho guardado no cache comum do navegador.
  if (arquivo === 'index.html') conteudo = conteudo.replace('src="app.js"', `src="app.js?v=${versaoApp}"`);
  writeFileSync(join(SAIDA, arquivo), conteudo);
}

// Vídeos, em ordem alfabética ("2 - x.mp4" vem antes de "10 - y.mp4").
const pastaVideos = join(RAIZ, PASTA_VIDEOS);
const arquivos = existsSync(pastaVideos) ? readdirSync(pastaVideos) : [];
const nomes = arquivos
  .filter((nome) => !nome.startsWith('.') && statSync(join(pastaVideos, nome)).isFile())
  .filter((nome) => {
    const ehVideo = EXTENSOES.has(extname(nome).toLowerCase());
    if (!ehVideo && !/\.(txt|md)$/i.test(nome)) console.log(`  (ignorado, não é vídeo: ${nome})`);
    return ehVideo;
  })
  .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));

const videos = [];
let total = 0;
for (const nome of nomes) {
  const origem = join(pastaVideos, nome);
  const tamanho = statSync(origem).size;
  if (!tamanho) {
    console.log(`  (ignorado, arquivo vazio: ${nome})`);
    continue;
  }
  const hash = hashDe(readFileSync(origem)).slice(0, 16);
  copyFileSync(origem, join(SAIDA, PASTA_VIDEOS, nome));
  total += tamanho;
  // ?v=hash: se um vídeo for trocado mantendo o nome, o endereço muda e a TV baixa de novo.
  videos.push({ nome, url: `${PASTA_VIDEOS}/${encodeURIComponent(nome)}?v=${hash}`, tamanho, hash });
  console.log(`  ✔ ${nome} (${mb(tamanho)})`);
}

const playlist = {
  versao: hashDe(JSON.stringify(videos.map((v) => [v.nome, v.hash]))).slice(0, 12),
  app: versaoApp,
  gerado: new Date().toISOString(),
  videos,
};
writeFileSync(join(SAIDA, 'playlist.json'), JSON.stringify(playlist, null, 2) + '\n');

console.log(`\n${videos.length} vídeo(s), ${mb(total)} no total. Versão ${playlist.versao}.`);
if (!videos.length) console.log('Aviso: nenhum vídeo na pasta "videos" — a TV vai mostrar uma mensagem.');
if (total > LIMITE_SITE * 0.9) {
  console.error(`Os vídeos somam ${mb(total)}; o GitHub Pages aceita no máximo 1 GB por site.`);
  if (total > LIMITE_SITE) process.exit(1);
}
