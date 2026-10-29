# Vídeo TV

Site simples que passa vídeos em loop na TV. Você coloca o vídeo na pasta
`videos`, dá dois cliques no `publicar.bat` e, em poucos minutos, a TV troca
o vídeo sozinha.

A TV guarda uma cópia de cada vídeo. Se a internet oscilar ou cair, o vídeo
continua passando, inclusive se a TV for desligada e ligada de novo sem
internet. A internet só é necessária para baixar vídeos novos.

## Como funciona

1. Você coloca os vídeos em `videos/` e roda o `publicar.bat`.
2. O GitHub monta e publica o site sozinho, em 1 a 2 minutos.
3. A TV confere a lista de vídeos a cada 2 minutos. Quando há novidade, baixa
   em segundo plano, sem interromper o que está passando.
4. Quando o vídeo atual termina, entra o conteúdo novo, e as cópias antigas
   são apagadas da TV.

Se o download for interrompido porque a internet caiu, nada pela metade fica
guardado. A TV continua com o vídeo antigo e tenta de novo quando a conexão
voltar.

---

## Primeira vez (só uma vez)

### 1. Criar a conta e o repositório no GitHub

1. Crie uma conta gratuita em <https://github.com/signup>.
2. Crie um repositório em <https://github.com/new>:
   - **Repository name**: escolha um dos dois:
     - Um nome curto, como `tv`. O endereço fica
       `https://SEU-USUARIO.github.io/tv/`.
     - **`SEU-USUARIO.github.io`**, todo em minúsculas, para o endereço mais
       curto possível: `https://SEU-USUARIO.github.io/`. Cada conta só pode
       ter um repositório desse tipo.
   - Marque **Public**. No plano gratuito, o GitHub Pages só funciona com
     repositório público, então qualquer pessoa com o endereço consegue ver
     os vídeos.
   - **Não** marque "Add a README file".
3. No repositório, abra **Settings → Pages**. Em **Build and deployment →
   Source**, escolha **GitHub Actions**.

### 2. Ligar esta pasta ao repositório

Precisa do Git instalado (<https://git-scm.com/download/win>, é só avançar
na instalação). Abra o PowerShell nesta pasta e rode, trocando
`SEU-USUARIO` e `tv` pelo seu usuário e pelo nome do repositório:

```powershell
git init -b main
git remote add origin https://github.com/SEU-USUARIO/tv.git
```

Se você escolheu o repositório `SEU-USUARIO.github.io`, o endereço fica
`https://github.com/SEU-USUARIO/SEU-USUARIO.github.io.git`.

Se errou o endereço, corrija com:

```powershell
git remote set-url origin https://github.com/SEU-USUARIO/tv.git
```

Se o Git nunca foi usado neste computador, informe também seu nome e e-mail
(uma vez só). O e-mail fica visível no repositório, que é público. Para não
expor o seu, use o e-mail "noreply" que o GitHub mostra em
**Settings → Emails**:

```powershell
git config --global user.name "Seu Nome"
git config --global user.email "seu-email-noreply@users.noreply.github.com"
```

### 3. Publicar

Coloque um vídeo em `videos/` e dê dois cliques no **`publicar.bat`**. Na
primeira vez, o Git abre o navegador para você entrar na conta do GitHub.

Para acompanhar a publicação, abra a aba **Actions** do repositório. Quando
ficar verde, o site está no ar. Se ficar vermelho porque o passo 1.3
(Source = GitHub Actions) ainda não tinha sido feito, faça o passo e rode o
`publicar.bat` de novo.

---

## No dia a dia

| Quero… | Faça |
|---|---|
| Trocar o vídeo | Apague o antigo de `videos/`, coloque o novo e rode `publicar.bat` |
| Passar vários vídeos em sequência | Coloque todos em `videos/`. Eles tocam em ordem alfabética. Numere os nomes: `1 - abertura.mp4`, `2 - promo.mp4` |
| Tirar um vídeo da TV | Apague o arquivo de `videos/` e rode `publicar.bat` |

Depois de publicar, a TV troca o vídeo em uns 5 minutos: até 2 para o GitHub
publicar, até 2 para a TV perceber, e mais o tempo de download e de terminar
o vídeo que está passando.

O GitHub fica sempre **igual a esta pasta**. Mudanças feitas direto no site
do GitHub são desfeitas na próxima publicação. O histórico de vídeos antigos
não é guardado, para o repositório não crescer.

## Formato e tamanho dos vídeos

- **MP4 (H.264 + áudio AAC)**: é o formato que qualquer TV toca.
- **Menos de 100 MB por arquivo**: é o limite do GitHub, e o `publicar.bat`
  avisa se passar disso. O site inteiro pode ter até 1 GB.
- **Navegador da própria Smart TV guarda pouco.** Mantenha o total de vídeos
  em até uns 150 MB. Na troca, a TV precisa de espaço para o vídeo antigo e o
  novo ao mesmo tempo. TV Box e computador aguentam bem mais. Para conferir,
  abra o site com `?debug=1`: deve aparecer "Cópia no aparelho: sim". Se
  aparecer "PARCIAL", algum vídeo não coube e só toca com internet.
- Para reduzir um vídeo, use o **HandBrake**, que é gratuito
  (<https://handbrake.fr>). Escolha o preset **"Fast 1080p30"**, ou
  **"Fast 720p30"** para vídeos longos, e salve como MP4. Como referência,
  1 minuto em 1080p fica em torno de 30 a 40 MB. Guarde o original **fora**
  desta pasta.

## Encurtar o link

O endereço do GitHub já é razoável, mas é chato de digitar no controle da TV.
Opções gratuitas:

1. **Não precisar de encurtador**: use um repositório chamado
   `SEU-USUARIO.github.io` (veja o passo 1). Fica `https://SEU-USUARIO.github.io/`.
2. **is.gd**, a opção recomendada. É grátis, não pede conta, não mostra
   anúncio, o link não expira e dá para escolher o nome. Para criar, abra no
   navegador do computador, trocando os dois trechos:

   ```text
   https://is.gd/create.php?format=simple&url=https://SEU-USUARIO.github.io/tv/&shorturl=tvdaloja
   ```

   A página responde com o link pronto, por exemplo `https://is.gd/tvdaloja`.
   - O nome precisa ter de 5 a 30 caracteres, só com letras, números e `_`
     (sem hífen). Maiúsculas e minúsculas fazem diferença.
   - Se o nome já existir, a página avisa; tente outro.
   - O link não pode ser editado depois. Não tem problema: o endereço do
     GitHub continua o mesmo quando você troca o vídeo.
3. **TinyURL**, como alternativa. Tem campo "Alias" para escolher o nome. Às
   vezes mostra uma página intermediária com anúncio, então teste o link na
   TV antes de confiar nele.

Evite o **Bitly** gratuito, que mostra página de anúncio antes de abrir, e o
**encurtador.com.br** gratuito, que tem contagem regressiva e pede um clique.

**Importante:** use o link curto só para **digitar** na TV. Depois que o site
abrir, salve como favorito ou página inicial o **endereço completo do
GitHub**. No Fully Kiosk, use também o endereço completo. Se a TV ligar sem
internet, o encurtador não abre, mas o endereço do GitHub abre a partir da
cópia guardada.

## Na TV

1. Abra no navegador da TV o endereço **completo, com a barra no final**:
   `https://SEU-USUARIO.github.io/tv/`
2. Na primeira vez, a tela mostra "Baixando vídeo… %". Depois o vídeo começa.
3. **Quando o vídeo aparecer**, aperte **OK** no controle para colocar o
   vídeo em tela cheia. Se você apertou antes, aperte OK de novo.
4. Salve esse endereço como **favorito ou página inicial**.

Usando o navegador da própria TV, a tela cheia precisa de um OK cada vez que
a TV é ligada. Com o Fully Kiosk, ela já abre em tela cheia.

Se aparecer "Pressione OK para iniciar", é porque o navegador da TV bloqueou a
reprodução automática. Basta apertar OK.

Nas configurações da TV, desligue o **desligamento automático**, a
**economia de energia** e o **timer de desligar**. Muitas TVs se desligam
depois de algumas horas sem ninguém mexer no controle.

### Qual aparelho usar

- **Navegador da própria Smart TV** (Samsung, LG): funciona na maioria dos
  modelos de 2018 em diante, mas é a opção menos confiável. Na LG, o descanso
  de tela só fica desligado enquanto um vídeo está em **tela cheia**, por isso
  aperte OK com o vídeo passando. Teste por algumas horas antes de deixar a
  TV sozinha.
- **Mais confiável**: um **TV Box Android / Google TV homologado pela
  Anatel** (por exemplo, Xiaomi TV Stick/Box), ligado na HDMI, com o app
  **Fully Kiosk Browser**. Nas opções gratuitas do app, configure:
  - **Start URL**: o endereço completo do GitHub com a barra no final (por
    exemplo, `https://SEU-USUARIO.github.io/tv/`), nunca o link curto;
  - **Launch on Boot** (abrir ao ligar);
  - **Keep Screen On** (manter a tela ligada);
  - **Autoplay Videos** (iniciar o vídeo sozinho).

  Evite "TV box" genérico, que pode vir com vírus. Os Fire TV Stick mais
  novos (4K Select e HD 2026) não instalam o Fully Kiosk.
- **Computador ou mini PC** ligado na TV: Chrome em modo quiosque, abrindo
  sozinho com o Windows.

### Opções no endereço

Acrescente ao final do endereço, por exemplo `https://SEU-USUARIO.github.io/tv/?som=1`:

| Opção | O que faz |
|---|---|
| `?som=1` | Toca com som. Alguns navegadores só liberam o som depois que você aperta OK |
| `?cobrir=1` | Preenche a tela toda, cortando as bordas em vez de deixar faixas pretas |
| `?debug=1` | Mostra um painel com o estado: internet, cópia guardada e downloads |
| `?som=1&cobrir=1` | Combina opções |

Teclas: **OK/Enter** liga a tela cheia, **M** liga ou desliga o som e **D**
mostra ou esconde o painel de estado.

---

## Limites do plano gratuito

| Limite | Valor |
|---|---|
| Tamanho de cada vídeo | Menos de 100 MB |
| Tamanho do site inteiro | Até 1 GB |
| Tráfego por mês | Cerca de 100 GB. Cada TV baixa cada vídeo uma vez só, então sobra muito, desde que os vídeos caibam no aparelho (veja `?debug=1`) |
| Repositório | Precisa ser público |

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| `publicar.bat` reclama de arquivo acima de 100 MB | Comprima o vídeo com o HandBrake e tire o original desta pasta |
| `publicar.bat` diz "Não consegui enviar ao GitHub" | Confira a internet e rode de novo. Se o endereço mostrado estiver errado, corrija com `git remote set-url` (passo 2) |
| O site não atualizou | Veja a aba **Actions** do repositório. Se estiver vermelho, abra para ver o erro e rode o `publicar.bat` de novo depois de resolver |
| A TV não trocou o vídeo | Espere uns 5 minutos. Abra com `?debug=1` para ver o que a TV está fazendo |
| Tela preta | Aperte **Voltar** para sair da tela cheia e ler o aviso, ou abra com `?debug=1` |
| "Sem conexão com a internet" na TV | Na primeira vez a TV precisa de internet para baixar o vídeo. Depois funciona sem |
| "Não foi possível reproduzir o vídeo" | O arquivo não é MP4 H.264 (vídeos de iPhone costumam ser HEVC). Converta com o HandBrake |
| "Cópia no aparelho: PARCIAL" no `?debug=1` | Os vídeos não cabem no navegador da TV. Use vídeos menores ou um TV Box |
| A TV abre a página de erro quando está sem internet | Ela foi aberta pelo link curto ou sem a `/` no final. Salve o endereço completo |

## Arquivos do projeto

| Arquivo | Para que serve |
|---|---|
| `videos/` | Seus vídeos |
| `publicar.bat` | Publica (dois cliques) |
| `index.html`, `app.js` | O site (player, cópia offline e atualização automática) |
| `sw.js` | Faz a página abrir mesmo sem internet |
| `scripts/montar-site.mjs` | Gera a lista de vídeos (roda no GitHub) |
| `scripts/publicar.ps1` | O que o `publicar.bat` executa |
| `.github/workflows/publicar.yml` | Instrução para o GitHub publicar a cada envio |
