param(
  [Parameter(Mandatory = $true)]
  [string]$SourceDirectory,
  [Parameter(Mandatory = $true)]
  [string]$StagingDirectory
)

$ErrorActionPreference = "Stop"

function Convert-ToSlug([string]$value) {
  $normalized = $value.ToLowerInvariant()
  $normalized = [Text.RegularExpressions.Regex]::Replace($normalized, "[^a-z0-9]+", "-")
  return $normalized.Trim("-")
}

function Get-ShapeText($shape) {
  try {
    if ($shape.HasTextFrame -and $shape.TextFrame.HasText) {
      return $shape.TextFrame.TextRange.Text.Trim()
    }
  } catch {}
  return ""
}

function Get-TitleShape($slide, [double]$slideHeight) {
  try {
    $title = $slide.Shapes.Title
    if ($title -and (Get-ShapeText $title)) { return $title }
  } catch {}

  $best = $null
  $bestScore = -1
  for ($index = 1; $index -le $slide.Shapes.Count; $index++) {
    $shape = $slide.Shapes.Item($index)
    $text = Get-ShapeText $shape
    if (-not $text -or $shape.Top -gt ($slideHeight * 0.32)) { continue }
    $fontSize = 0
    try { $fontSize = [double]$shape.TextFrame.TextRange.Font.Size } catch {}
    $score = ($fontSize * 1000) - [double]$shape.Top
    if ($score -gt $bestScore) {
      $best = $shape
      $bestScore = $score
    }
  }
  return $best
}

function Export-ShapeCollection($slide, [string[]]$shapeNames, [string]$destination) {
  if ($shapeNames.Count -eq 0) { return $false }
  try {
    if ($shapeNames.Count -eq 1) {
      $slide.Shapes.Item($shapeNames[0]).Export($destination, 2)
    } else {
      $slide.Shapes.Range([object[]]$shapeNames).Export($destination, 2)
    }
    return (Test-Path -LiteralPath $destination)
  } catch {
    return $false
  }
}

$source = [IO.Path]::GetFullPath($SourceDirectory)
$staging = [IO.Path]::GetFullPath($StagingDirectory)
if (-not (Test-Path -LiteralPath $source)) {
  throw "Source directory not found: $source"
}

New-Item -ItemType Directory -Force -Path $staging | Out-Null
$rawDirectory = Join-Path $staging "raw"
New-Item -ItemType Directory -Force -Path $rawDirectory | Out-Null
$manifest = New-Object System.Collections.Generic.List[object]
$powerPoint = $null

try {
  $powerPoint = New-Object -ComObject PowerPoint.Application
  $decks = @(Get-ChildItem -LiteralPath $source -Filter "*.pptx" | Sort-Object Name)
  $deckNumber = 0

  foreach ($deck in $decks) {
    $deckNumber++
    $presentation = $null
    try {
      $presentation = $powerPoint.Presentations.Open($deck.FullName, $true, $true, $false)
      $kit = $deck.BaseName.Replace("SMART-", "")
      $kitSlug = Convert-ToSlug $kit
      $slideHeight = [double]$presentation.PageSetup.SlideHeight

      for ($slideNumber = 1; $slideNumber -le $presentation.Slides.Count; $slideNumber++) {
        $slide = $presentation.Slides.Item($slideNumber)
        $groups = @()
        for ($shapeIndex = 1; $shapeIndex -le $slide.Shapes.Count; $shapeIndex++) {
          $shape = $slide.Shapes.Item($shapeIndex)
          if ($shape.Type -eq 6 -and $shape.Width -ge 30 -and $shape.Height -ge 30) {
            $groups += $shape
          }
        }
        if ($groups.Count -eq 0) { continue }

        $titleShape = Get-TitleShape $slide $slideHeight
        $title = if ($titleShape) { Get-ShapeText $titleShape } else { "" }
        if (-not $title) { $title = "$kit - $slideNumber" }
        $id = "$kitSlug-s$($slideNumber.ToString('000'))"

        $studyNames = @()
        for ($shapeIndex = 1; $shapeIndex -le $slide.Shapes.Count; $shapeIndex++) {
          $shape = $slide.Shapes.Item($shapeIndex)
          if ($titleShape -and $shape.Name -eq $titleShape.Name) { continue }
          $shapeText = Get-ShapeText $shape
          if ($shapeText -match "Creative Commons|Servier Medical Art|moved by you") { continue }
          $studyNames += $shape.Name
        }

        $studyPath = Join-Path $rawDirectory "$id-study.png"
        if (Export-ShapeCollection $slide $studyNames $studyPath) {
          $manifest.Add([pscustomobject]@{
            id = "$id-study"; purpose = "study"; kit = $kit; kitSlug = $kitSlug
            title = $title; slide = $slideNumber; sourceDeck = $deck.Name; rawPath = $studyPath
          })
        }

        $largestGroup = $groups | Sort-Object { $_.Width * $_.Height } -Descending | Select-Object -First 1
        $quizPath = Join-Path $rawDirectory "$id-quiz.png"
        if ($largestGroup -and (Export-ShapeCollection $slide @($largestGroup.Name) $quizPath)) {
          $manifest.Add([pscustomobject]@{
            id = "$id-quiz"; purpose = "quiz"; kit = $kit; kitSlug = $kitSlug
            title = $title; slide = $slideNumber; sourceDeck = $deck.Name; rawPath = $quizPath
          })
        }
      }
      Write-Output ("[{0}/{1}] {2}: {3} slides" -f $deckNumber, $decks.Count, $deck.Name, $presentation.Slides.Count)
    } catch {
      Write-Warning ("Skipped {0}: {1}" -f $deck.Name, $_.Exception.Message)
    } finally {
      if ($presentation) { $presentation.Close() }
    }
  }
} finally {
  if ($powerPoint) { $powerPoint.Quit() }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

$manifestPath = Join-Path $staging "raw-manifest.json"
[IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
Write-Output ("Exported {0} raw assets to {1}" -f $manifest.Count, $staging)
