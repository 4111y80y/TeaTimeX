---
description: 打包发布 TeaTimeX 插件到 Chrome Web Store
---

# 发布流程

⚠️ **重要规则**：发布包不能包含本地用户数据（members.json 必须为空），用户安装后应该是干净的插件。

## 步骤

// turbo-all

1. 创建临时发布目录，复制所有文件（排除 .git、.zip、.gitignore）
```powershell
$src = "d:\5118\TeaTimeX"; $tmp = "d:\5118\TeaTimeX_publish"; if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }; New-Item $tmp -ItemType Directory | Out-Null; Get-ChildItem $src -Exclude ".git","*.zip",".gitignore",".agents" | Where-Object { $_.Name -ne '.git' } | Copy-Item -Destination $tmp -Recurse
```

2. 将 members.json 替换为空数据（用户安装时应为空）
```powershell
'{"groups":[]}' | Set-Content "d:\5118\TeaTimeX_publish\members.json" -Encoding UTF8
```

3. 读取 manifest.json 中的版本号，打包 zip
```powershell
$ver = (Get-Content "d:\5118\TeaTimeX_publish\manifest.json" | ConvertFrom-Json).version; $zip = "d:\5118\TeaTimeX\TeaTimeX-v$ver.zip"; Remove-Item $zip -ErrorAction SilentlyContinue; Compress-Archive -Path "d:\5118\TeaTimeX_publish\*" -DestinationPath $zip -Force; Remove-Item "d:\5118\TeaTimeX_publish" -Recurse -Force; Write-Host "打包完成: $zip ($((Get-Item $zip).Length) bytes)"
```

4. 上传到 Chrome Web Store Developer Dashboard
