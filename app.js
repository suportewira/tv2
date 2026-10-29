/*
 * Vídeo TV — toca em loop os vídeos da pasta "videos" e guarda uma cópia
 * de cada um no aparelho (Cache API), para continuar tocando quando a
 * internet cai. A cada poucos minutos confere se há vídeo novo; se houver,
 * baixa em segundo plano e troca quando o vídeo atual terminar.
 *
 * Escrito em JavaScript "antigo" (ES5, sem => nem async/await) de propósito:
 * navegadores de Smart TV costumam ser versões velhas do Chrome/WebKit.
 *
 * Parâmetros opcionais no endereço:
 *   ?som=1     tenta tocar com som (se o navegador bloquear, toca mudo)
 *   ?cobrir=1  preenche a tela toda (corta as bordas em vez de faixas pretas)
 *   ?debug=1   mostra um painel com o estado (internet, cache, downloads)
 * Teclas: OK/Enter = tela cheia · M = liga/desliga som · D = painel de estado
 */
(function () {
  'use strict';

  // Trocado na publicação (scripts/montar-site.mjs) pelo hash do código do site.
  var VERSAO_APP = '__VERSAO_APP__';

  var CONFIG = {
    playlist: 'playlist.json',
    verificarACadaMs: 2 * 60 * 1000,  // procura vídeo novo a cada 2 minutos
    trocarNaHora: false,              // false = espera o vídeo atual terminar para trocar
    reiniciarPlayerACadaHoras: 24,    // 1x por dia reinicia o player (TVs acumulam memória)
    cacheVideos: 'videotv2-videos',
    chaveLocal: 'videotv2:playlist',   // última lista que entrou na tela
    chaveUltima: 'videotv2:ultima',    // última lista vista na internet
    chaveRecarga: 'videotv2:recarga'   // quando a página recarregou por site novo
  };

  var video = document.getElementById('video');
  var elMensagem = document.getElementById('mensagem');
  var elDebug = document.getElementById('debug');

  if (typeof Promise === 'undefined') {
    elMensagem.textContent = 'O navegador desta TV é antigo demais para este site.\n' +
      'Use um TV Box Android com o Fully Kiosk Browser, ou um computador com o Chrome.';
    return;
  }

  var params = lerParametros();
  var comSom = params.som === '1';
  var debugAtivo = params.debug === '1';
  if (params.cobrir === '1') document.documentElement.className += ' cobrir';

  var temCache = typeof caches !== 'undefined' && !!caches && typeof caches.open === 'function';

  var atual = null;        // { dados, itens, completo } — o que está passando
  var pendente = null;     // conteúdo novo já baixado, esperando a hora de entrar
  var emPreparo = null;    // playlist sendo baixada agora
  var ultimaLista = lerLocal(CONFIG.chaveUltima);
  var preparando = false;
  var verificando = false;
  var primeiraBusca = true; // a 1ª lista vinda da internet desde que a página abriu
  var indice = 0;
  var falhasSeguidas = 0;
  var errosSeguidos = 0;
  var jaRebaixado = {};
  var falhasEspaco = {};
  var timerVerificacao = null;
  var timerErro = null;
  var recarregarAoTerminar = false;
  var reiniciarAoTerminar = false;
  var somBloqueado = false;
  var aguardandoToque = false;
  var online = null;
  var ultimaRedeOk = 0;
  var inicio = Date.now();
  var textoDownload = '';
  var textoEspaco = '';
  var linhasLog = [];
  var ancora = document.createElement('a');

  // ---------------------------------------------------------------- início

  function iniciar() {
    registrarServiceWorker();
    pedirArmazenamentoPersistente();
    manterTelaLigada();

    // 1º) Toca na hora o que já está guardado no aparelho (funciona offline).
    var salvo = lerLocal(CONFIG.chaveLocal);
    if (!salvo) { verificar(); return; }
    preparando = true;
    prepararPlaylist(salvo, true).then(function (prep) {
      preparando = false;
      if (prep.itens.length || !salvo.videos.length) aplicar(prep);
      verificar(); // 2º) Confere na internet se há algo novo.
    }, function (e) {
      preparando = false;
      log('Não consegui ler a cópia local: ' + msgErro(e));
      verificar();
    });
  }

  // --------------------------------------------------- verificar novidades

  function agendarVerificacao(ms) {
    clearTimeout(timerVerificacao);
    timerVerificacao = setTimeout(verificar, ms);
  }

  function esperaAposFalha() {
    return Math.min(CONFIG.verificarACadaMs, 5000 * Math.pow(2, Math.min(falhasSeguidas, 6)));
  }

  function verificar() {
    if (verificando) return; // a verificação em andamento agenda a próxima
    if (preparando) { agendarVerificacao(CONFIG.verificarACadaMs); return; }
    verificando = true;
    buscarPlaylist().then(function (dados) {
      verificando = false;
      online = true;
      ultimaRedeOk = Date.now();
      ultimaLista = dados;
      salvarLocal(CONFIG.chaveUltima, dados);
      var naAbertura = primeiraBusca;
      primeiraBusca = false;
      conferirVersaoDoSite(dados.app);

      var base = pendente || atual;
      var mesma = base && base.dados.versao === dados.versao;
      // Nada a fazer se já está completa na tela (ou pronta para entrar).
      // Se a pendente está incompleta por falta de espaço, espera a troca
      // liberar espaço antes de tentar de novo.
      if (preparando || (mesma && (base.completo || base === pendente))) {
        falhasSeguidas = 0;
        agendarVerificacao(CONFIG.verificarACadaMs);
        desenharDebug();
        return;
      }
      preparar(dados, naAbertura);
    }, function (e) {
      verificando = false;
      online = false;
      falhasSeguidas++;
      log('Sem acesso à lista de vídeos (' + msgErro(e) + ')');
      if (!atual) {
        mostrarMensagem('Sem conexão com a internet.\nO vídeo aparece assim que a conexão voltar.');
      }
      agendarVerificacao(esperaAposFalha());
    });
  }

  // naAbertura = novidade achada logo ao abrir a página: troca sem esperar o
  // vídeo guardado terminar (na guia anônima o vídeo novo já entraria direto).
  function preparar(dados, naAbertura) {
    preparando = true;
    emPreparo = dados;
    if (!temAlgoNaTela() && dados.videos.length) mostrarMensagem('Baixando vídeo…');
    log('Preparando versão ' + dados.versao + ' (' + dados.videos.length + ' vídeo(s))');

    prepararPlaylist(dados, false).then(function (prep) {
      preparando = false;
      emPreparo = null;
      textoDownload = '';
      falhasSeguidas = 0;
      // Aba escondida: ninguém está vendo, então pode trocar no meio do vídeo.
      if (!temAlgoNaTela() || CONFIG.trocarNaHora || naAbertura || document.hidden || !estaTocando()) {
        aplicar(prep);
      } else {
        if (pendente) revogar(pendente.itens);
        pendente = prep;
        ajustarLoop();
        log('Conteúdo novo pronto; entra quando o vídeo atual terminar');
      }
      agendarVerificacao(CONFIG.verificarACadaMs);
    }, function (e) {
      preparando = false;
      emPreparo = null;
      textoDownload = '';
      falhasSeguidas++;
      log('Falha ao baixar: ' + msgErro(e));
      if (!temAlgoNaTela()) {
        mostrarMensagem('A internet falhou durante o download.\nTentando de novo…');
      }
      agendarVerificacao(esperaAposFalha());
    });
  }

  function buscarPlaylist() {
    // ?t= garante que nenhum cache (navegador ou CDN) devolva uma lista velha.
    var url = CONFIG.playlist + '?t=' + Date.now();
    return comTempoLimite(baixarTexto(url), 15000).then(function (texto) {
      var bruto = JSON.parse(texto);
      if (!bruto || !bruto.videos) throw new Error('playlist.json inválido');
      return normalizar(bruto);
    });
  }

  function normalizar(bruto) {
    var videos = [];
    var lista = bruto.videos || [];
    for (var i = 0; i < lista.length; i++) {
      var v = lista[i];
      if (v && v.url) videos.push({ url: String(v.url), nome: String(v.nome || v.url), tamanho: Number(v.tamanho) || 0 });
    }
    return { versao: String(bruto.versao || ''), app: String(bruto.app || ''), videos: videos };
  }

  // ------------------------------------------------- baixar / ler do cache

  // Prepara os vídeos um de cada vez (para não dividir a internet entre eles).
  // somenteCache = true: usa só o que já está guardado, sem baixar nada.
  function prepararPlaylist(dados, somenteCache) {
    var itens = [];
    var completo = true;
    var i = 0;

    function proximo() {
      if (i >= dados.videos.length) return Promise.resolve();
      var entrada = dados.videos[i];
      var numero = ++i;
      return prepararItem(entrada, somenteCache, function (recebido, total) {
        progresso(numero, dados.videos.length, recebido, total);
      }).then(function (pronto) {
        if (pronto) {
          pronto.url = entrada.url;
          pronto.nome = entrada.nome;
          itens.push(pronto);
          if (pronto.semEspaco) completo = false; // tenta guardar de novo depois
        } else {
          completo = false;
        }
        return proximo();
      });
    }

    return proximo().then(function () {
      return { dados: dados, itens: itens, completo: completo };
    }, function (e) {
      revogar(itens);
      throw e;
    });
  }

  // Devolve { src, modo: 'cache' | 'rede' } ou null (somenteCache e não guardado).
  function prepararItem(item, somenteCache, aoProgredir) {
    if (!temCache) return Promise.resolve({ src: item.url, modo: 'rede' });
    return caches.open(CONFIG.cacheVideos).then(function (cache) {
      return lerDoCache(cache, item).then(function (pronto) {
        if (pronto || somenteCache) return pronto;
        return baixarParaCache(cache, item, aoProgredir).then(function () {
          return lerDoCache(cache, item);
        }).then(function (pronto2) {
          if (!pronto2) throw new Error('download incompleto de ' + item.nome);
          return pronto2;
        });
      });
    }, function (e) {
      // Navegador não deixa usar o cache (modo anônimo, por exemplo).
      temCache = false;
      log('Cache indisponível (' + msgErro(e) + '); tocando direto da internet');
      return { src: item.url, modo: 'rede' };
    }).then(null, function (e) {
      if (!ehFaltaDeEspaco(e)) throw e;
      // Falta espaço: toca pela internet por enquanto. Tenta guardar de novo
      // uma vez, depois que a troca apagar os vídeos antigos.
      falhasEspaco[item.url] = (falhasEspaco[item.url] || 0) + 1;
      var tentarDeNovo = falhasEspaco[item.url] < 2;
      log('Sem espaço no aparelho para guardar ' + item.nome + '; tocando pela internet' +
        (tentarDeNovo ? '' : ' (o vídeo não cabe neste aparelho)'));
      apagarDoCache(item.url);
      return { src: item.url, modo: 'rede', semEspaco: tentarDeNovo };
    });
  }

  function lerDoCache(cache, item) {
    return cache.match(item.url).then(function (resposta) {
      if (!resposta) return null;
      return resposta.blob().then(function (blob) {
        if (!blob.size || (item.tamanho && blob.size !== item.tamanho)) {
          log('Cópia local de ' + item.nome + ' está incompleta; será baixada de novo');
          return cache['delete'](item.url).then(function () { return null; });
        }
        return { src: URL.createObjectURL(blob), modo: 'cache', blobUrl: true };
      });
    });
  }

  function baixarParaCache(cache, item, aoProgredir) {
    log('Baixando ' + item.nome + (item.tamanho ? ' (' + mb(item.tamanho) + ')' : ''));
    // Wi-Fi instável às vezes congela a conexão sem dar erro: se nada chegar
    // por 1 minuto, cancela (e a próxima verificação tenta de novo).
    var cancelador = typeof AbortController === 'function' && typeof TransformStream === 'function'
      ? new AbortController() : null;
    var ultimaAtividade = Date.now();
    var vigia = cancelador && setInterval(function () {
      if (Date.now() - ultimaAtividade < 60000) return;
      log('Download de ' + item.nome + ' parado há 1 minuto; cancelando');
      cancelador.abort();
    }, 5000);
    function pararVigia() { clearInterval(vigia); }

    // no-store: não guarda uma 2ª cópia no cache comum do navegador.
    var opcoes = { cache: 'no-store' };
    if (cancelador) opcoes.signal = cancelador.signal;
    return fetch(item.url, opcoes).then(function (resposta) {
      ultimaAtividade = Date.now();
      if (!resposta.ok) throw new Error('HTTP ' + resposta.status + ' ao baixar ' + item.nome);
      var total = item.tamanho || Number(resposta.headers.get('content-length')) || 0;
      var corpo = resposta;
      if (resposta.body && resposta.body.pipeThrough && typeof TransformStream === 'function') {
        var recebido = 0;
        var contador = new TransformStream({
          transform: function (pedaco, controle) {
            ultimaAtividade = Date.now();
            recebido += pedaco.byteLength;
            aoProgredir(recebido, total);
            controle.enqueue(pedaco);
          }
        });
        corpo = new Response(resposta.body.pipeThrough(contador), {
          status: resposta.status, statusText: resposta.statusText, headers: resposta.headers
        });
      } else {
        pararVigia(); // sem como medir o progresso, não dá para vigiar
      }
      // Se a internet cair no meio, cache.put falha e nada pela metade fica guardado.
      return cache.put(item.url, corpo);
    }).then(function (v) { pararVigia(); return v; }, function (e) { pararVigia(); throw e; });
  }

  var ultimoProgresso = 0;
  function progresso(numero, quantidade, recebido, total) {
    var agora = Date.now();
    if (agora - ultimoProgresso < 500) return;
    ultimoProgresso = agora;
    var feito = total ? Math.min(100, Math.floor(recebido * 100 / total)) + '%' : mb(recebido);
    textoDownload = 'Baixando vídeo' + (quantidade > 1 ? ' ' + numero + ' de ' + quantidade : '') + '… ' + feito;
    if (!temAlgoNaTela()) {
      mostrarMensagem(textoDownload + '\n\nSó na primeira vez — depois continua tocando mesmo sem internet.');
    }
    desenharDebug();
  }

  function apagarDoCache(url) {
    if (!temCache) return;
    caches.open(CONFIG.cacheVideos).then(function (cache) { return cache['delete'](url); }).then(null, function () {});
  }

  // Apaga do aparelho os vídeos que não estão em nenhuma lista em uso:
  // a da tela, a pendente, a que está baixando e a última vista na internet.
  function limparCacheAntigo() {
    if (!temCache) return;
    var manter = {};
    function marcar(dados) {
      if (!dados) return;
      for (var i = 0; i < dados.videos.length; i++) manter[absoluta(dados.videos[i].url)] = true;
    }
    marcar(atual && atual.dados);
    marcar(pendente && pendente.dados);
    marcar(emPreparo);
    marcar(ultimaLista);
    caches.open(CONFIG.cacheVideos).then(function (cache) {
      return cache.keys().then(function (pedidos) {
        return Promise.all(pedidos.map(function (pedido) {
          if (manter[pedido.url]) return false;
          log('Apagando cópia antiga: ' + decodeURIComponent(pedido.url.split('/').pop().split('?')[0]));
          return cache['delete'](pedido);
        }));
      });
    }).then(function (apagados) {
      if (apagados.indexOf(true) === -1 || !atual) return;
      // Espaço liberado: vídeos que não couberam antes ganham nova chance.
      falhasEspaco = {};
      for (var i = 0; i < atual.itens.length; i++) {
        if (atual.itens[i].modo === 'rede' && temCache) atual.completo = false;
      }
      if (!atual.completo) agendarVerificacao(5000);
    }, function () {});
  }

  function revogar(itens) {
    if (!itens) return;
    for (var i = 0; i < itens.length; i++) {
      if (itens[i].blobUrl) {
        try { URL.revokeObjectURL(itens[i].src); } catch (e) { /* ignora */ }
      }
    }
  }

  // ---------------------------------------------------------- reprodução

  function aplicar(prep) {
    var anterior = atual;
    atual = prep;
    if (pendente && pendente !== prep) revogar(pendente.itens);
    pendente = null;
    errosSeguidos = 0;
    salvarLocal(CONFIG.chaveLocal, prep.dados);
    log('Exibindo versão ' + prep.dados.versao + ' (' + prep.itens.length + ' vídeo(s))' +
      (prep.completo ? '' : ' — incompleta, falta baixar'));
    tocar(0);
    if (anterior && anterior !== prep) revogar(anterior.itens);
    limparCacheAntigo();
  }

  function tocar(i) {
    clearTimeout(timerErro); // só uma tentativa agendada por vez
    timerErro = null;
    if (!atual || !atual.itens.length) {
      video.removeAttribute('src');
      try { video.load(); } catch (e) { /* ignora */ }
      if (atual && atual.dados.videos.length) {
        mostrarMensagem('Os vídeos ainda não foram baixados neste aparelho.\nAguardando a internet…');
      } else if (atual) {
        mostrarMensagem('Nenhum vídeo publicado.\nColoque um arquivo .mp4 na pasta "videos" e publique.');
      }
      return;
    }
    var n = atual.itens.length;
    indice = ((i % n) + n) % n;
    var item = atual.itens[indice];
    ajustarLoop();
    // Mesmo endereço mas com erro: atribuir de novo força recarregar o vídeo.
    if (video.getAttribute('src') !== item.src || video.error || video.networkState === 3) {
      video.src = item.src;
    } else {
      try { video.currentTime = 0; } catch (e) { /* ignora */ }
    }
    reproduzir();
    log('Tocando ' + item.nome + (item.modo === 'cache' ? ' (cópia no aparelho)' : ' (pela internet)'));
  }

  // Com um vídeo só, usa loop nativo (sem emenda visível). Quando há algo
  // para fazer no fim do vídeo (trocar, recarregar ou reiniciar), desliga o
  // loop para receber o evento "ended".
  function ajustarLoop() {
    video.loop = !!(atual && atual.itens.length === 1 && !pendente && !recarregarAoTerminar && !reiniciarAoTerminar);
  }

  function reproduzir() {
    video.muted = !(comSom && !somBloqueado);
    var promessa;
    try { promessa = video.play(); } catch (e) { promessa = null; }
    if (!promessa || !promessa.then) return;
    promessa.then(function () {
      if (aguardandoToque) { aguardandoToque = false; mostrarMensagem(''); }
    }, function (e) {
      if (!e || e.name !== 'NotAllowedError') return; // AbortError etc.: troca de vídeo, ignora
      if (!video.muted) {
        somBloqueado = true;
        log('O navegador bloqueou o som automático; tocando sem som');
        reproduzir();
        return;
      }
      aguardandoToque = true;
      mostrarMensagem('Pressione OK no controle (ou clique na tela) para iniciar o vídeo.');
    });
  }

  function estaTocando() {
    return !!video.getAttribute('src') && !video.paused && !video.ended && !video.error;
  }

  function temAlgoNaTela() {
    return !!(atual && atual.itens.length);
  }

  // Tarefas que esperam o fim do vídeo. Devolve true se assumiu a reprodução.
  function tarefasDoFimDoVideo() {
    if (pendente) { aplicar(pendente); return true; }
    if (preparando) return false; // espera o download em andamento terminar
    if (recarregarAoTerminar) {
      if (podeRecarregar() && !emTelaCheia()) { recarregar(); return true; }
      recarregarAoTerminar = false;
      ajustarLoop();
    }
    if (reiniciarAoTerminar) { reiniciarPlayer(); return true; }
    return false;
  }

  video.addEventListener('playing', function () {
    errosSeguidos = 0;
    if (atual && atual.itens[indice]) atual.itens[indice].erros = 0;
    if (!aguardandoToque) mostrarMensagem('');
  });

  video.addEventListener('ended', function () {
    if (!tarefasDoFimDoVideo()) tocar(indice + 1);
  });

  video.addEventListener('error', function () {
    if (!atual || !atual.itens.length || !video.getAttribute('src')) return;
    var item = atual.itens[indice];
    if (!item || video.getAttribute('src') !== item.src) return;
    errosSeguidos++;
    item.erros = (item.erros || 0) + 1;
    log('Erro ao tocar ' + item.nome + ' (código ' + (video.error ? video.error.code : '?') + ')');

    // Cópia local falhando repetidamente: descarta e baixa de novo (1x por sessão).
    if (item.modo === 'cache' && item.erros >= 3 && !jaRebaixado[item.url]) {
      jaRebaixado[item.url] = true;
      log('Descartando a cópia local de ' + item.nome + '; será baixada de novo');
      apagarDoCache(item.url);
      try { URL.revokeObjectURL(item.src); } catch (e) { /* ignora */ }
      item.src = item.url;
      item.modo = 'rede';
      item.blobUrl = false;
      item.erros = 0;
      atual.completo = false;
      agendarVerificacao(15000);
    }

    var desistir = errosSeguidos >= atual.itens.length * 3;
    if (desistir) {
      mostrarMensagem(item.modo === 'rede' && online === false
        ? 'Sem internet, e este vídeo não está guardado no aparelho (falta espaço).\nTentando de novo…'
        : 'Não foi possível reproduzir o vídeo.\nConfira se o arquivo é MP4 (H.264). Tentando de novo…');
    }
    var alvo = atual;
    clearTimeout(timerErro);
    timerErro = setTimeout(function () {
      timerErro = null;
      if (atual !== alvo) return; // já trocou de conteúdo nesse meio-tempo
      if (pendente) { aplicar(pendente); return; }
      tocar(atual.itens.length > 1 ? indice + 1 : indice);
    }, desistir ? 60000 : Math.min(15000, 1000 * errosSeguidos));
  });

  // Vigia: se o vídeo parar de andar, tenta destravar.
  var ultimoTempo = -1;
  var ultimoAvanco = Date.now();
  setInterval(function () {
    var agora = Date.now();
    if (CONFIG.reiniciarPlayerACadaHoras > 0 && !reiniciarAoTerminar &&
        agora - inicio > CONFIG.reiniciarPlayerACadaHoras * 3600000) {
      reiniciarAoTerminar = true;
      ajustarLoop();
    }
    // Sem vídeo, esperando o OK, aba escondida ou com nova tentativa já agendada.
    if (!temAlgoNaTela() || aguardandoToque || document.hidden || timerErro) {
      ultimoAvanco = agora;
      if (!temAlgoNaTela() && recarregarAoTerminar && !preparando && podeRecarregar() && !emTelaCheia()) recarregar();
      desenharDebug();
      return;
    }
    var t = video.currentTime;
    if (t !== ultimoTempo) {
      ultimoTempo = t;
      ultimoAvanco = agora;
    } else {
      if (video.paused && !video.ended && !video.error) reproduzir();
      if (agora - ultimoAvanco > 30000) {
        ultimoAvanco = agora;
        log('Vídeo parado há 30 s; reiniciando');
        if (tarefasDoFimDoVideo()) return;
        video.removeAttribute('src');
        try { video.load(); } catch (e) { /* ignora */ }
        tocar(atual.itens.length > 1 ? indice + 1 : indice);
      }
    }
    if (debugAtivo && agora % 30000 < 5000) atualizarEspaco();
    desenharDebug();
  }, 5000);

  // ------------------------------------------- manutenção e recarga da página

  // Uma vez por dia recria o reprodutor de vídeo, sem recarregar a página
  // (recarregar tiraria a TV da tela cheia).
  function reiniciarPlayer() {
    reiniciarAoTerminar = false;
    inicio = Date.now();
    log('Manutenção diária: reiniciando o player');
    video.removeAttribute('src');
    try { video.load(); } catch (e) { /* ignora */ }
    tocar(indice + 1);
  }

  // O código do site mudou (alguém publicou uma versão nova do app.js etc.):
  // recarrega a página quando o vídeo atual terminar.
  function conferirVersaoDoSite(app) {
    if (!app || VERSAO_APP.indexOf('__') === 0 || app === VERSAO_APP || recarregarAoTerminar) return;
    if (!podeRecarregar() || emTelaCheia()) return;
    // No máximo 1x por hora, caso a TV receba de novo uma cópia velha do site.
    var ultima = Number(lerTexto(CONFIG.chaveRecarga)) || 0;
    var agora = Date.now();
    if (agora >= ultima && agora - ultima < 3600000) return;
    log('Nova versão do site publicada; recarrega no fim do vídeo');
    recarregarAoTerminar = true;
    ajustarLoop();
  }

  // Só recarrega se a página consegue abrir de novo sem internet
  // (service worker ativo) ou se a internet acabou de responder.
  function podeRecarregar() {
    var sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    return !!sw || Date.now() - ultimaRedeOk < 60000;
  }

  function recarregar() {
    log('Recarregando a página');
    salvarTexto(CONFIG.chaveRecarga, String(Date.now()));
    location.reload();
  }

  // ------------------------------------------------------ extras do aparelho

  function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      log('Navegador sem service worker: a página precisa de internet para abrir');
      return;
    }
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
      setInterval(function () { try { reg.update(); } catch (e) { /* ignora */ } }, 6 * 3600000);
    }, function (e) {
      log('Service worker não registrado: ' + msgErro(e));
    });
  }

  function pedirArmazenamentoPersistente() {
    if (!navigator.storage || !navigator.storage.persist) return;
    navigator.storage.persist().then(function (ok) {
      log('Armazenamento persistente: ' + (ok ? 'sim' : 'não (o navegador pode apagar se faltar espaço)'));
    }, function () {});
  }

  var travaTela = null;
  function manterTelaLigada() {
    if (travaTela || document.hidden || !navigator.wakeLock || !navigator.wakeLock.request) return;
    navigator.wakeLock.request('screen').then(function (trava) {
      travaTela = trava;
      trava.addEventListener('release', function () { travaTela = null; });
    }, function () {});
  }

  function atualizarEspaco() {
    if (!navigator.storage || !navigator.storage.estimate) return;
    navigator.storage.estimate().then(function (e) {
      textoEspaco = mb(e.usage || 0) + ' usados de ' + mb(e.quota || 0);
    }, function () {});
  }

  function elementoEmTelaCheia() {
    return document.fullscreenElement || document.webkitFullscreenElement ||
      document.webkitCurrentFullScreenElement || document.msFullscreenElement || null;
  }

  function emTelaCheia() {
    return !!elementoEmTelaCheia();
  }

  // Avisos ficam escondidos atrás do vídeo em tela cheia; sai dela para mostrá-los.
  function sairDaTelaCheiaDoVideo() {
    if (elementoEmTelaCheia() !== video) return;
    var sair = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen || document.msExitFullscreen;
    if (!sair) return;
    try {
      var r = sair.call(document);
      if (r && r.then) r.then(null, function () {});
    } catch (e) { /* ignora */ }
  }

  function telaCheia() {
    // Com vídeo passando, a tela cheia é do próprio vídeo: algumas TVs (LG)
    // só seguram o descanso de tela com um vídeo em tela cheia.
    var el = temAlgoNaTela() && !debugAtivo ? video : document.documentElement;
    if (elementoEmTelaCheia() === el) return;
    var pedir = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen || el.msRequestFullscreen;
    if (!pedir) return;
    try {
      var r = pedir.call(el);
      if (r && r.then) r.then(null, function () {});
    } catch (e) { /* ignora */ }
  }

  function aoInteragir() {
    if (aguardandoToque) { aguardandoToque = false; mostrarMensagem(''); }
    somBloqueado = false;
    telaCheia();
    if (temAlgoNaTela()) reproduzir();
  }

  document.addEventListener('click', aoInteragir);
  document.addEventListener('keydown', function (ev) {
    var tecla = String(ev.key || '').toLowerCase();
    if (tecla === 'd') {
      debugAtivo = !debugAtivo;
      elDebug.hidden = !debugAtivo;
      atualizarEspaco();
      desenharDebug();
      if (emTelaCheia()) telaCheia(); // painel visível: tela cheia da página, não do vídeo
      return;
    }
    if (tecla === 'm') {
      comSom = !comSom;
      somBloqueado = false;
      log(comSom ? 'Som ligado' : 'Som desligado');
      if (temAlgoNaTela()) reproduzir();
      return;
    }
    aoInteragir();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    manterTelaLigada();
    if (temAlgoNaTela()) reproduzir();
  });

  window.addEventListener('online', function () { agendarVerificacao(1000); });
  window.addEventListener('offline', function () { online = false; desenharDebug(); });

  // ------------------------------------------------------------ utilidades

  function mostrarMensagem(texto) {
    elMensagem.textContent = texto;
    elMensagem.hidden = !texto;
    if (texto) sairDaTelaCheiaDoVideo();
  }

  function log(msg) {
    var d = new Date();
    linhasLog.push(dois(d.getHours()) + ':' + dois(d.getMinutes()) + ':' + dois(d.getSeconds()) + '  ' + msg);
    if (linhasLog.length > 12) linhasLog.shift();
    if (window.console && console.log) console.log('[VideoTV] ' + msg);
    desenharDebug();
  }

  function desenharDebug() {
    if (!debugAtivo) return;
    elDebug.hidden = false;
    var item = atual && atual.itens[indice];
    var sw = navigator.serviceWorker && navigator.serviceWorker.controller;
    var pelaRede = 0;
    for (var i = 0; atual && i < atual.itens.length; i++) if (atual.itens[i].modo === 'rede') pelaRede++;
    var copia = !temCache ? 'não suportada' : pelaRede ? 'PARCIAL (' + pelaRede + ' vídeo(s) só pela internet)' : 'sim';
    var linhas = [
      'Internet: ' + (online === null ? '…' : online ? 'ok' : 'SEM CONEXÃO'),
      'Cópia no aparelho: ' + copia + (textoEspaco ? ' · ' + textoEspaco : ''),
      'Abre sem internet: ' + (sw ? 'sim' : 'ainda não (service worker inativo)'),
      'Vídeos: ' + (atual ? atual.dados.versao + (atual.completo ? '' : ' (incompleta)') : '-') +
        ' · site ' + (VERSAO_APP.indexOf('__') === 0 ? 'local' : VERSAO_APP),
      'Tocando: ' + (item ? (indice + 1) + '/' + atual.itens.length + ' ' + item.nome + ' [' + item.modo + ']' : '-'),
      'Novidade: ' + (pendente ? 'pronta, entra no fim do vídeo' : preparando ? (textoDownload || 'preparando…') : '-'),
      ''
    ];
    elDebug.textContent = linhas.concat(linhasLog).join('\n');
  }

  function baixarTexto(url) {
    if (window.fetch) {
      return fetch(url, { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      });
    }
    return new Promise(function (ok, falha) {
      var x = new XMLHttpRequest();
      x.open('GET', url);
      x.onload = function () {
        if (x.status >= 200 && x.status < 300) ok(x.responseText);
        else falha(new Error('HTTP ' + x.status));
      };
      x.onerror = function () { falha(new Error('sem conexão')); };
      x.send();
    });
  }

  function comTempoLimite(promessa, ms) {
    return new Promise(function (ok, falha) {
      var t = setTimeout(function () { falha(new Error('tempo esgotado')); }, ms);
      promessa.then(function (v) { clearTimeout(t); ok(v); }, function (e) { clearTimeout(t); falha(e); });
    });
  }

  function salvarTexto(chave, texto) {
    try { localStorage.setItem(chave, texto); } catch (e) { /* ignora */ }
  }

  function lerTexto(chave) {
    try { return localStorage.getItem(chave); } catch (e) { return null; }
  }

  function salvarLocal(chave, dados) {
    salvarTexto(chave, JSON.stringify(dados));
  }

  function lerLocal(chave) {
    try {
      var texto = lerTexto(chave);
      return texto ? normalizar(JSON.parse(texto)) : null;
    } catch (e) {
      return null;
    }
  }

  function ehFaltaDeEspaco(e) {
    return !!e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(String(e.message || '')));
  }

  function absoluta(url) {
    ancora.href = url;
    return ancora.href;
  }

  function msgErro(e) {
    return e && e.message ? e.message : String(e);
  }

  function mb(bytes) {
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function dois(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function lerParametros() {
    var r = {};
    var partes = location.search.replace(/^\?/, '').split('&');
    for (var i = 0; i < partes.length; i++) {
      if (!partes[i]) continue;
      var kv = partes[i].split('=');
      try {
        r[decodeURIComponent(kv[0])] = kv.length > 1 ? decodeURIComponent(kv[1].replace(/\+/g, ' ')) : '1';
      } catch (e) { /* ignora parâmetro malformado */ }
    }
    return r;
  }

  iniciar();
})();
