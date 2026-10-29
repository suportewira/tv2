# Publica no GitHub o conteúdo desta pasta (chamado pelo publicar.bat).
# O que estiver aqui passa a ser o site: o GitHub monta tudo sozinho (1 a 2
# minutos) e a TV baixa o conteúdo novo e troca quando o vídeo atual terminar.
# Versões antigas não ficam guardadas no GitHub, para o repositório não
# crescer a cada vídeo trocado.

$ErrorActionPreference = 'Continue'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz
$branch = 'main'

function Parar([string]$mensagem) {
  Write-Host ''
  Write-Host $mensagem -ForegroundColor Red
  exit 1
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Parar 'O Git não está instalado. Baixe em https://git-scm.com/download/win, instale e rode de novo.'
}
if (-not (Test-Path (Join-Path $raiz '.git'))) {
  git init -q -b $branch
  if ($LASTEXITCODE -ne 0) { Parar 'Não consegui preparar o Git nesta pasta (git init).' }
}
$remoto = git remote get-url origin 2>$null
if (-not $remoto) {
  Parar ("Falta ligar esta pasta ao repositório do GitHub. Abra o PowerShell nesta pasta e rode`n" +
    "(trocando SEU-USUARIO e tv pelos seus):`n`n  git remote add origin https://github.com/SEU-USUARIO/tv.git`n`n" +
    'Detalhes no LEIA-ME.md, parte "Primeira vez".')
}

# Limpa sobras de uma execução interrompida (janela fechada no meio, queda de energia).
if ((Test-Path .git\rebase-merge) -or (Test-Path .git\rebase-apply)) { git rebase --abort 2>$null }
if (Test-Path .git\MERGE_HEAD) { git merge --abort 2>$null }
if ((Test-Path .git\index.lock) -and -not (Get-Process git -ErrorAction SilentlyContinue)) {
  Remove-Item .git\index.lock -Force
}

# ------------------------------------------------ confere os arquivos
$extensoes = @('.mp4', '.m4v', '.webm', '.mov', '.ogv')
$pastaVideos = Join-Path $raiz 'videos'
$naPasta = @(Get-ChildItem -Path $pastaVideos -File -ErrorAction SilentlyContinue | Sort-Object Name)
$videos = @($naPasta | Where-Object { $extensoes -contains $_.Extension.ToLower() })
$outros = @($naPasta | Where-Object { ($extensoes -notcontains $_.Extension.ToLower()) -and ($_.Extension -notmatch '^\.(txt|md)$') })

Write-Host 'Vídeos na pasta:' -ForegroundColor Cyan
if ($videos.Count -eq 0) { Write-Host '  (nenhum - a TV vai mostrar um aviso)' -ForegroundColor Yellow }
foreach ($v in $videos) { Write-Host ('  - {0}  ({1:N1} MB)' -f $v.Name, ($v.Length / 1MB)) }
foreach ($v in @($videos | Where-Object { $_.Extension.ToLower() -ne '.mp4' })) {
  Write-Host ('  ! {0}: se não tocar na TV, converta para MP4 (H.264) com o HandBrake' -f $v.Name) -ForegroundColor Yellow
}
foreach ($o in $outros) {
  Write-Host ('  ! {0}: formato que a TV não toca; será ignorado (use MP4)' -f $o.Name) -ForegroundColor Yellow
}

$vazios = @($videos | Where-Object { $_.Length -eq 0 })
if ($vazios.Count -gt 0) {
  Parar ("Vídeo vazio (0 bytes), provavelmente uma cópia que não terminou: " + (($vazios | ForEach-Object { $_.Name }) -join ', ') + "`nApague e copie o arquivo de novo.")
}

# O GitHub recusa qualquer arquivo com 100 MB ou mais, em qualquer pasta.
$ignoradas = @('.git', '_site', 'node_modules')
$grandes = @(Get-ChildItem -Path $raiz -Force | Where-Object { $ignoradas -notcontains $_.Name } | ForEach-Object {
    if ($_.PSIsContainer) { Get-ChildItem -Path $_.FullName -Recurse -File -Force -ErrorAction SilentlyContinue } else { $_ }
  } | Where-Object { $_.Length -ge 100MB })
if ($grandes.Count -gt 0) {
  $lista = ($grandes | ForEach-Object { '  - {0} ({1:N0} MB)' -f $_.FullName.Substring($raiz.Length + 1), ($_.Length / 1MB) }) -join "`n"
  Parar ("O GitHub não aceita arquivos com 100 MB ou mais:`n$lista`nComprima o vídeo (veja o LEIA-ME.md) ou tire o arquivo desta pasta, e rode de novo.")
}
$total = ($videos | Measure-Object -Property Length -Sum).Sum
if ($total -gt 1GB) {
  Parar ('Os vídeos somam {0:N0} MB; o GitHub Pages aceita no máximo 1 GB.' -f ($total / 1MB))
}

# ------------------------------------------------ registra e envia
# Cada publicação é uma versão única, sem histórico: o repositório fica do
# tamanho do site. O commit é montado sem mexer nos arquivos da pasta.
Write-Host ''
git add -A
if ($LASTEXITCODE -ne 0) {
  Parar 'Não consegui preparar os arquivos (git add). Feche outros programas que usam o Git (ex.: GitHub Desktop) e rode de novo.'
}
$arvore = git write-tree
if ($LASTEXITCODE -ne 0 -or -not $arvore) { Parar 'Não consegui preparar a publicação (git write-tree).' }
$anterior = git rev-parse -q --verify 'HEAD^{tree}' 2>$null
if ($anterior -eq $arvore) {
  Write-Host 'Nada mudou nos arquivos desde a última vez; publicando de novo assim mesmo.' -ForegroundColor Yellow
}
$commit = git commit-tree $arvore -m ('Publicação de ' + (Get-Date -Format 'dd/MM/yyyy HH:mm'))
if ($LASTEXITCODE -ne 0 -or -not $commit) {
  Parar 'Não consegui registrar a publicação (git commit). Confira se o Git tem nome e e-mail configurados (veja o LEIA-ME.md).'
}
git update-ref "refs/heads/$branch" $commit
if ($LASTEXITCODE -ne 0) { Parar 'Não consegui registrar a publicação (git update-ref).' }
git symbolic-ref HEAD "refs/heads/$branch"

Write-Host 'Enviando para o GitHub (vídeos grandes podem levar alguns minutos)...' -ForegroundColor Cyan
git push --force -u origin $branch
if ($LASTEXITCODE -ne 0) {
  Parar ("Não consegui enviar ao GitHub. Confira a internet e o login do GitHub e rode de novo.`n" +
    "Endereço configurado: $remoto (se estiver errado, veja o LEIA-ME.md).")
}

# Mostra o endereço do site (https://usuario.github.io/repositorio/).
$site = ''
$painel = ''
if ($remoto -match 'github\.com[:/]+([^/]+)/([^/]+?)(\.git)?/?$') {
  $usuario = $Matches[1]
  $repo = $Matches[2]
  $painel = "https://github.com/$usuario/$repo/actions"
  if ($repo.ToLower() -eq "$usuario.github.io".ToLower()) { $site = "https://$($usuario.ToLower()).github.io/" }
  else { $site = "https://$($usuario.ToLower()).github.io/$repo/" }
}

Write-Host ''
Write-Host 'Publicado!' -ForegroundColor Green
if ($site) { Write-Host "Em 1 a 2 minutos o site estará atualizado: $site" }
Write-Host 'A TV confere a cada 2 minutos, baixa o conteúdo novo e troca quando o vídeo atual terminar.'
if ($painel) { Write-Host "Acompanhe a publicação em: $painel" }

# Libera neste computador o espaço das versões antigas.
Write-Host ''
Write-Host 'Liberando espaço das versões antigas neste computador...'
git reflog expire --expire=now --all 2>$null
git gc -q --prune=now 2>$null
Write-Host 'Pronto.'
