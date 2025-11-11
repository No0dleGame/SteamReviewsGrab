$root = Get-Location
$prefix = 'http://localhost:8080/'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Output ("Preview URL: " + $prefix)

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $rel = $ctx.Request.Url.LocalPath.TrimStart('/')
  if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
  $path = Join-Path $root $rel
  if (Test-Path $path -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($path).ToLower()
    switch ($ext) {
      '.html' { $ctx.Response.ContentType = 'text/html' }
      '.css'  { $ctx.Response.ContentType = 'text/css' }
      '.js'   { $ctx.Response.ContentType = 'application/javascript' }
      '.json' { $ctx.Response.ContentType = 'application/json' }
      '.png'  { $ctx.Response.ContentType = 'image/png' }
      '.jpg'  { $ctx.Response.ContentType = 'image/jpeg' }
      Default { $ctx.Response.ContentType = 'application/octet-stream' }
    }
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
    $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not found')
    $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
  }
  $ctx.Response.OutputStream.Close()
  $ctx.Response.Close()
}