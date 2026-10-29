/*
 * Service worker do Vídeo TV: guarda os arquivos do site no aparelho para
 * que a página abra mesmo sem internet (por exemplo, quando a TV é ligada
 * com a internet fora do ar). Os vídeos são guardados pela própria página
 * (app.js); aqui eles e a playlist passam direto, sem interferência.
 *
 * Estratégia: internet primeiro (para pegar atualizações do site); se a
 * internet falhar ou demorar mais de 4 s, usa a cópia guardada.
 */
var CACHE_APP = 'videotv2-app-v1';
var ARQUIVOS = ['./', 'app.js', 'manifest.webmanifest', 'icon.svg'];
var BASE = new URL('./', self.location.href).pathname; // ex.: /tv/

self.addEventListener('install', function (evento) {
  evento.waitUntil(
    caches.open(CACHE_APP).then(function (cache) {
      return Promise.all(ARQUIVOS.map(function (url) {
        return fetch(new Request(url, { cache: 'reload' })).then(function (resposta) {
          if (!resposta.ok) throw new Error('HTTP ' + resposta.status + ' em ' + url);
          return cache.put(url, resposta);
        });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (evento) {
  evento.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.map(function (nome) {
        if (nome.indexOf('videotv2-app-') === 0 && nome !== CACHE_APP) return caches['delete'](nome);
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (evento) {
  var pedido = evento.request;
  if (pedido.method !== 'GET') return;
  var url = new URL(pedido.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf(BASE) !== 0) return;
  var caminho = url.pathname.slice(BASE.length);
  if (caminho.indexOf('videos/') === 0 || caminho === 'playlist.json') return;

  var navegacao = pedido.mode === 'navigate';
  // A página é uma só: qualquer navegação usa a cópia de "./".
  // Para os demais arquivos, ignora ?parâmetros.
  var chave = navegacao ? self.location.origin + BASE : url.origin + url.pathname;

  // Navegação vai como veio; os outros arquivos são revalidados (no-cache)
  // para não usar uma cópia velha do cache comum do navegador.
  var guardar = null;
  var daInternet = (navegacao
    ? fetch(pedido)
    : fetch(pedido.url, { cache: 'no-cache', credentials: 'same-origin' })
  ).then(function (resposta) {
    if (resposta && resposta.ok && resposta.type === 'basic' && !resposta.redirected) {
      var copia = resposta.clone();
      guardar = caches.open(CACHE_APP).then(function (cache) { return cache.put(chave, copia); });
    }
    return resposta;
  });

  evento.respondWith(internetOuCopia(daInternet, chave));
  // Mantém o service worker vivo até a cópia nova ser guardada, mesmo
  // quando a resposta já saiu da cópia antiga por causa da demora.
  evento.waitUntil(daInternet.then(function () { return guardar; }).then(null, function () {}));
});

function internetOuCopia(daInternet, chave) {
  return new Promise(function (resolver, rejeitar) {
    var pronto = false;
    function entregar(resposta) {
      if (pronto || !resposta) return false;
      pronto = true;
      resolver(resposta);
      return true;
    }
    function usarCopia() {
      return caches.open(CACHE_APP).then(function (cache) {
        return cache.match(chave);
      }).then(entregar, function () { return false; });
    }

    var timer = setTimeout(usarCopia, 4000);

    daInternet.then(function (resposta) {
      clearTimeout(timer);
      // Servidor com problema (ex.: erro 5xx): prefere a cópia, se houver.
      if (resposta.ok || resposta.type === 'opaqueredirect') { entregar(resposta); return; }
      usarCopia().then(function (usou) { if (!usou) entregar(resposta); });
    }, function (erro) {
      clearTimeout(timer);
      usarCopia().then(function (usou) {
        if (!usou && !pronto) { pronto = true; rejeitar(erro); }
      });
    });
  });
}
