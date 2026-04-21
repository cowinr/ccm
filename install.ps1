$ErrorActionPreference = "Stop"

$repo = "cowinr/ccm"
$tmp = "$env:TEMP\ccm.vsix"

Write-Host "Fetching latest CCM release..."
$release = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest"
$asset = $release.assets | Where-Object { $_.name -like "*.vsix" } | Select-Object -First 1

if (-not $asset) {
    Write-Error "Could not find a .vsix asset in the latest release."
    exit 1
}

Write-Host "Downloading $($asset.browser_download_url)..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $tmp

Write-Host "Installing extension..."
code --install-extension $tmp --force

Remove-Item $tmp
Write-Host ""
Write-Host "Done. Reload VS Code: Ctrl+Shift+P -> Developer: Reload Window"
Write-Host "On first activation the extension will prompt you to install the bridge -- click Install."
