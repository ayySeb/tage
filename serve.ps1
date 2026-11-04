# Minimal static file server for local development: .\serve.ps1 [-Port 5173]
param([int]$Port = 5173)

$root = [IO.Path]::GetFullPath($PSScriptRoot)
$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'
  '.webmanifest' = 'application/manifest+json'
  '.svg' = 'image/svg+xml'
  '.png' = 'image/png'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Tage laeuft auf http://localhost:$Port"

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $type = $types[[IO.Path]::GetExtension($file).ToLower()]
      if (-not $type) { $type = 'application/octet-stream' }
      $res.ContentType = $type
      $res.Headers.Add('Cache-Control', 'no-cache')
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.Close()
  }
}
